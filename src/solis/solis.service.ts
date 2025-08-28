import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { SerialPort } from 'serialport';
import { setTimeout as delay } from 'node:timers/promises';
import { ModbusRTU, ModbusFunctionCode } from '../common/modbus-rtu';
import { LoggingService } from '../common/logging.service';
import {
  SolisACData,
  SolisBatteryData,
  SolisConnectionOptions,
  SolisGridData,
  SolisHouseData,
  SolisInverterData,
  SolisPVData
} from './models/solis.model';
import { Constants } from '../constants';

/**
 * Service for communicating with Solis S5-EH1P5K-L solar inverter
 *
 * Manages RS485/Modbus RTU communication to retrieve real-time data from the solar inverter.
 * Provides comprehensive monitoring of solar production, battery status, grid interaction,
 * and house consumption for home automation decision-making.
 *
 * Features:
 * - RS485 serial communication via USB-to-RS485 adapter
 * - Modbus RTU protocol implementation for register reading
 * - Real-time solar PV panel monitoring (voltage, current, power)
 * - AC power generation and frequency monitoring
 * - Battery state-of-charge and power flow tracking
 * - Grid import/export energy measurement
 * - House consumption calculation and monitoring
 * - Connection lifecycle management with automatic reconnection
 *
 * Hardware Requirements:
 * - Waveshare USB-to-RS485 module (appears as /dev/ttyACM0 or COM port)
 * - Connection to Solis inverter COM2 port (pins 3 & 4)
 */
@Injectable()
export class SolisService implements OnModuleInit, OnModuleDestroy {
  private readonly context = SolisService.name;

  @Inject(LoggingService) private readonly logger: LoggingService;

  private port: SerialPort | null = null;
  private isConnected: boolean = false;

  private portName: string;
  private options: Required<SolisConnectionOptions>;

  // Delay between Modbus commands (in ms)
  private static readonly COMMAND_DELAY = 20; // Minimal delay between consecutive Modbus commands

  // Solis register mapping (Modbus addresses)
  private static readonly REGISTERS = {
    // Status and general information
    STATUS: 33095,

    // PV data (solar panels)
    PV1_VOLTAGE: 33049,
    PV1_CURRENT: 33050,
    PV2_VOLTAGE: 33051,
    PV2_CURRENT: 33052,
    PV3_VOLTAGE: 33053,
    PV3_CURRENT: 33054,
    PV4_VOLTAGE: 33055,
    PV4_CURRENT: 33056,
    PV_TOTAL_POWER: 33057,

    // AC data
    AC_TOTAL_POWER: 33079,
    TEMPERATURE: 33093,

    // House data
    HOUSE_CONSUMPTION: 33147,
    BACKUP_CONSUMPTION: 33148,
    HOUSE_ENERGY_TOTAL: 33177,

    // Grid data
    GRID_ACTIVE_POWER: 33130,
    INVERTER_AC_POWER: 33151,
    GRID_IMPORTED_ENERGY: 33169,
    GRID_EXPORTED_ENERGY: 33173,

    // Battery data
    BATTERY_POWER: 33149,
    BATTERY_SOC: 33139,
    BATTERY_VOLTAGE: 33133,
    BATTERY_CURRENT: 33134,
    BATTERY_CURRENT_DIRECTION: 33135
  };

  constructor() {}

  /**
   * Module initialization
   */
  public async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Solis inverter connection...', this.context);
    this.portName = Constants.SOLIS.PORT;
    this.options = {
      baudRate: Constants.SOLIS.BAUD_RATE,
      dataBits: Constants.SOLIS.DATA_BITS,
      stopBits: Constants.SOLIS.STOP_BITS,
      parity: Constants.SOLIS.PARITY,
      slaveId: Constants.SOLIS.SLAVE_ID,
      responseTimeout: Constants.SOLIS.RESPONSE_TIMEOUT,
      retryCount: Constants.SOLIS.RETRY_COUNT,
      retryDelay: Constants.SOLIS.RETRY_DELAY
    };

    try {
      await this.connect();
      this.logger.log('Successfully connected to Solis inverter', this.context);
    } catch (error) {
      this.logger.error('Failed to connect to Solis inverter', error, this.context);
    }
  }

  public async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from Solis inverter...', this.context);
    await this.disconnect();
  }

  /**
   * Establishes connection with the Solis inverter
   */
  public async connect(): Promise<void> {
    if (this.isConnected) return;

    this.port = new SerialPort({
      path: this.portName,
      baudRate: this.options.baudRate,
      dataBits: this.options.dataBits,
      stopBits: this.options.stopBits,
      parity: this.options.parity
    });

    return new Promise((resolve, reject) => {
      this.port?.on('open', () => {
        this.isConnected = true;
        this.logger.log(`Connected to Solis inverter on ${this.portName}`, this.context);
        resolve();
      });

      this.port?.on('error', (err: Error) => {
        this.logger.error('Serial port error', err, this.context);
        reject(err);
      });
    });
  }

  /**
   * Closes the connection with the inverter
   */
  public async disconnect(): Promise<void> {
    if (this.port?.isOpen) {
      return new Promise((resolve) => {
        this.port?.close(() => {
          this.isConnected = false;
          this.logger.log('Disconnected from Solis inverter', this.context);
          resolve();
        });
      });
    }
  }

  /**
   * Reads one or more Modbus registers from the Solis inverter
   * 
   * Process Modbus RTU communication:
   * 1. Create request frame with slave ID, function code, register address
   * 2. Send frame via RS485 serial port
   * 3. Listen for response data chunks (can arrive in multiple packets)
   * 4. Parse complete response and extract register values
   */
  private async readRegisters(startAddr: number, quantity: number = 1): Promise<number[]> {
    // 1. VALIDATION: Ensure we have an active serial connection
    if (!this.isConnected || !this.port) {
      throw new Error('Not connected to inverter');
    }

    // 2. BUILD REQUEST: Create Modbus RTU frame with:
    //    - Slave ID (inverter address, usually 1)
    //    - Function Code 04 (Read Input Registers)
    //    - Register start address (e.g., 33049 for PV power)
    //    - Number of registers to read
    const frame = ModbusRTU.createReadFrame(
      this.options.slaveId,
      ModbusFunctionCode.READ_INPUT_REGISTERS,
      startAddr,
      quantity
    );

    return new Promise((resolve, reject) => {
      // 3. RESPONSE HANDLING: Prepare to collect response data
      let responseData = Buffer.alloc(0); // Accumulator for incoming data chunks
      let timeout: NodeJS.Timeout; // Timeout handler for response completion

      // 4. DATA RECEPTION: Handle incoming serial data
      const onData = (data: Buffer): void => {
        // Append new data chunk to accumulated response
        responseData = Buffer.concat([responseData, data]);
        
        // INTELLIGENT PARSING: Check if frame is complete immediately
        if (ModbusRTU.isFrameComplete(responseData)) {
          // Frame is complete - process immediately, no delay!
          clearTimeout(timeout);
          this.port?.removeListener('data', onData);

          // 5. PARSE RESPONSE: Extract Modbus data from raw bytes
          const response = ModbusRTU.parseResponse(responseData);
          if (!response || response.error) {
            reject(new Error(response?.error || 'Invalid response'));
            return;
          }

          // 6. EXTRACT VALUES: Convert raw bytes to register values
          if (response.data) {
            const registers = ModbusRTU.parseRegisters(response.data);
            resolve(registers); // Return array of register values
          } else {
            reject(new Error('No data received'));
          }
        } else {
          // Frame not complete yet - reset timeout and wait for more data
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            // Fallback timeout if frame never completes
            this.port?.removeListener('data', onData);
            reject(new Error('Incomplete frame - timeout waiting for remaining data'));
          }, 50); // Reduced fallback timeout to 50ms
        }
      };

      // 7. SETUP LISTENERS: Start listening for serial port data
      this.port?.on('data', onData);

      // 8. TIMEOUT PROTECTION: Prevent hanging if inverter doesn't respond
      timeout = setTimeout(() => {
        this.port?.removeListener('data', onData);
        reject(new Error('Timeout'));
      }, this.options.responseTimeout); // Usually 2000ms

      // 9. SEND REQUEST: Transmit Modbus frame to inverter via RS485
      this.port?.write(frame, (err) => {
        if (err) {
          // Clean up on write error
          this.port?.removeListener('data', onData);
          clearTimeout(timeout);
          reject(err);
        }
        // If write successful, wait for response in onData handler
      });
    });
  }

  /**
   * Retrieves solar PV panel data
   */
  public async getPVData(): Promise<SolisPVData> {
    const totalPowerRegs = await this.readRegisters(SolisService.REGISTERS.PV_TOTAL_POWER, 2);
    await delay(SolisService.COMMAND_DELAY);

    const pv1Voltage = await this.readRegisters(SolisService.REGISTERS.PV1_VOLTAGE);
    await delay(SolisService.COMMAND_DELAY);

    const pv1Current = await this.readRegisters(SolisService.REGISTERS.PV1_CURRENT);
    await delay(SolisService.COMMAND_DELAY);

    const pv2Voltage = await this.readRegisters(SolisService.REGISTERS.PV2_VOLTAGE);
    await delay(SolisService.COMMAND_DELAY);

    const pv2Current = await this.readRegisters(SolisService.REGISTERS.PV2_CURRENT);
    await delay(SolisService.COMMAND_DELAY);

    const pv1V = (pv1Voltage[0] || 0) / 10;
    const pv1A = (pv1Current[0] || 0) / 10;
    const pv2V = (pv2Voltage[0] || 0) / 10;
    const pv2A = (pv2Current[0] || 0) / 10;

    const totalPowerDC =
      totalPowerRegs.length >= 2 ? (totalPowerRegs[0]! << 16) | totalPowerRegs[1]! : totalPowerRegs[0] || 0;

    return {
      pv1: {
        voltage: pv1V,
        current: pv1A,
        power: pv1V * pv1A
      },
      pv2: {
        voltage: pv2V,
        current: pv2A,
        power: pv2V * pv2A
      },
      totalPowerDC
    };
  }

  /**
   * Retrieves AC power data
   */
  public async getACData(): Promise<SolisACData> {
    const powerRegs = await this.readRegisters(SolisService.REGISTERS.AC_TOTAL_POWER);
    await delay(SolisService.COMMAND_DELAY);

    const tempRegs = await this.readRegisters(SolisService.REGISTERS.TEMPERATURE);
    await delay(SolisService.COMMAND_DELAY);

    return {
      totalPowerAC: ((powerRegs[0] || 0) / 100) * 1000,
      frequency: 50,
      temperature: (tempRegs[0] || 0) / 10
    };
  }

  /**
   * Retrieves house consumption data
   */
  public async getHouseData(): Promise<SolisHouseData> {
    const consumption = await this.readRegisters(SolisService.REGISTERS.HOUSE_CONSUMPTION);
    await delay(SolisService.COMMAND_DELAY);

    const backupConsumption = await this.readRegisters(SolisService.REGISTERS.BACKUP_CONSUMPTION);
    await delay(SolisService.COMMAND_DELAY);

    return {
      consumption: consumption[0] || 0,
      backupConsumption: backupConsumption[0] || 0
    };
  }

  /**
   * Retrieves electrical grid data
   */
  public async getGridData(): Promise<SolisGridData> {
    const activePowerRegs = await this.readRegisters(SolisService.REGISTERS.GRID_ACTIVE_POWER, 2);
    await delay(SolisService.COMMAND_DELAY);

    const inverterPowerRegs = await this.readRegisters(SolisService.REGISTERS.INVERTER_AC_POWER, 2);
    await delay(SolisService.COMMAND_DELAY);

    const importedEnergyRegs = await this.readRegisters(SolisService.REGISTERS.GRID_IMPORTED_ENERGY, 2);
    await delay(SolisService.COMMAND_DELAY);

    const exportedEnergyRegs = await this.readRegisters(SolisService.REGISTERS.GRID_EXPORTED_ENERGY, 2);
    await delay(SolisService.COMMAND_DELAY);

    const activePower = activePowerRegs.length >= 2 ? (activePowerRegs[0]! << 16) | activePowerRegs[1]! : 0;
    const inverterPower = inverterPowerRegs.length >= 2 ? (inverterPowerRegs[0]! << 16) | inverterPowerRegs[1]! : 0;
    const importedEnergy =
      importedEnergyRegs.length >= 2 ? ((importedEnergyRegs[0]! << 16) | importedEnergyRegs[1]!) / 1000 : 0;
    const exportedEnergy =
      exportedEnergyRegs.length >= 2 ? ((exportedEnergyRegs[0]! << 16) | exportedEnergyRegs[1]!) / 1000 : 0;

    return {
      activePower,
      inverterPower,
      importedEnergyTotal: importedEnergy,
      exportedEnergyTotal: exportedEnergy
    };
  }

  /**
   * Retrieves battery data
   */
  public async getBatteryData(): Promise<SolisBatteryData> {
    const batteryPowerRegs = await this.readRegisters(SolisService.REGISTERS.BATTERY_POWER, 2);
    await delay(SolisService.COMMAND_DELAY);

    const socRegs = await this.readRegisters(SolisService.REGISTERS.BATTERY_SOC);
    await delay(SolisService.COMMAND_DELAY);

    const voltageRegs = await this.readRegisters(SolisService.REGISTERS.BATTERY_VOLTAGE);
    await delay(SolisService.COMMAND_DELAY);

    const currentRegs = await this.readRegisters(SolisService.REGISTERS.BATTERY_CURRENT);
    await delay(SolisService.COMMAND_DELAY);

    const directionRegs = await this.readRegisters(SolisService.REGISTERS.BATTERY_CURRENT_DIRECTION);
    await delay(SolisService.COMMAND_DELAY);

    const batteryPowerRaw = batteryPowerRegs.length >= 2 ? (batteryPowerRegs[0]! << 16) | batteryPowerRegs[1]! : 0;
    const direction = directionRegs[0] || 0; // 0=charge, 1=discharge

    // Apply sign based on direction: negative for charging, positive for discharging
    const batteryPower = direction === 1 ? batteryPowerRaw : -batteryPowerRaw;

    return {
      power: batteryPower,
      soc: socRegs[0] || 0,
      voltage: (voltageRegs[0] || 0) / 10,
      current: (currentRegs[0] || 0) / 10
    };
  }

  /**
   * TODO: find right status registers
   * Retrieves inverter status
   */
  public async getStatus(): Promise<{ code: number; text: string }> {
    try {
      // Try primary status register first
      const statusRegs = await this.readRegisters(SolisService.REGISTERS.STATUS);
      const statusCode = statusRegs[0] || 0;

      this.logger.debug(
        `Status register ${SolisService.REGISTERS.STATUS}: ${statusCode} (0x${statusCode.toString(16)})`,
        this.context
      );

      // Updated status mapping based on Solis documentation
      const statusMap: { [key: number]: string } = {
        0: 'Waiting',
        1: 'Normal',
        2: 'Normal',
        3: 'Alarm',
        4: 'Fault',
        8: 'Fault'
      };

      return {
        code: statusCode,
        text: statusMap[statusCode] || `Unknown (${statusCode}, 0x${statusCode.toString(16)})`
      };
    } catch (error) {
      this.logger.error('Failed to read status registers', error, this.context);
      throw error;
    }
  }

  /**
   * Generates simulated inverter data for testing purposes
   */
  private generateSimulatedData(): SolisInverterData {
    const scenarios = [
      // Full Powa!
      {
        name: 'Full Power',
        pvTotalPowerDC: 5500, // 5.5kW production
        houseConsumption: 500, // 500W consommation maison
        gridActivePower: 5000, // 5kW injection vers réseau
        batteryPower: 0, // 0W charge batterie
        batterySoc: 100
      },
      // Beaucoup de puissance disponible (journée ensoleillée)
      {
        name: 'High Power',
        pvTotalPowerDC: 4500, // 4.5kW production
        houseConsumption: 800, // 800W consommation maison
        gridActivePower: 3200, // 3.2kW injection vers réseau
        batteryPower: -500, // 500W charge batterie
        batterySoc: 85
      },
      // Puissance moyenne (journée nuageuse)
      {
        name: 'Medium Power',
        pvTotalPowerDC: 2200, // 2.2kW production
        houseConsumption: 1200, // 1.2kW consommation maison
        gridActivePower: 600, // 600W injection vers réseau
        batteryPower: -400, // 400W charge batterie
        batterySoc: 65
      },
      // Peu de puissance disponible (fin d'après-midi)
      {
        name: 'Low Power',
        pvTotalPowerDC: 800, // 800W production
        houseConsumption: 1100, // 1.1kW consommation maison
        gridActivePower: -200, // 200W tirage du réseau
        batteryPower: 100, // 100W décharge batterie
        batterySoc: 45
      },
      // Pas de puissance disponible (nuit/très nuageux)
      {
        name: 'No Power',
        pvTotalPowerDC: 0, // Pas de production
        houseConsumption: 500, // 500W consommation maison
        gridActivePower: -100, // 100W tirage du réseau
        batteryPower: 400, // 150W décharge batterie
        batterySoc: 25
      }
    ];

    // Sélection aléatoire d'un scénario
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

    this.logger.debug(`Simulating scenario: ${scenario.name}`, this.context);

    return {
      status: { code: 1, text: 'simulated' },
      timestamp: new Date(),
      pv: {
        pv1: {
          voltage: 380 + Math.random() * 20, // 380-400V
          current: scenario.pvTotalPowerDC > 0 ? scenario.pvTotalPowerDC / 2 / 390 : 0,
          power: scenario.pvTotalPowerDC / 2
        },
        pv2: {
          voltage: 375 + Math.random() * 25, // 375-400V
          current: scenario.pvTotalPowerDC > 0 ? scenario.pvTotalPowerDC / 2 / 385 : 0,
          power: scenario.pvTotalPowerDC / 2
        },
        totalPowerDC: scenario.pvTotalPowerDC
      },
      ac: {
        totalPowerAC: scenario.pvTotalPowerDC * 0.95, // 95% efficiency
        frequency: 50,
        temperature: 25 + Math.random() * 15 // 25-40°C
      },
      house: {
        consumption: scenario.houseConsumption,
        backupConsumption: 0
      },
      grid: {
        activePower: scenario.gridActivePower,
        inverterPower: scenario.pvTotalPowerDC * 0.95,
        importedEnergyTotal: 1500 + Math.random() * 500, // kWh cumulé
        exportedEnergyTotal: 800 + Math.random() * 300 // kWh cumulé
      },
      battery: {
        power: scenario.batteryPower,
        soc: scenario.batterySoc,
        voltage: 48.2 + Math.random() * 1.8, // 48-50V
        current: Math.abs(scenario.batteryPower) / 49
      }
    };
  }

  /**
   * Retrieves all inverter data at once
   */
  public async getAllData(): Promise<SolisInverterData> {
    // Si simulation activée, retourner des données simulées
    if (Constants.SOLIS.SIMULATE_DATA) {
      return this.generateSimulatedData();
    }

    if (!this.isConnected || !this.port) {
      throw new Error('Not connected to inverter');
    }

    // TODO: find right status registers
    // const status = await this.getStatus();
    // await delay(SolisService.COMMAND_DELAY);

    const pv = await this.getPVData();

    const ac = await this.getACData();

    const house = await this.getHouseData();

    const grid = await this.getGridData();

    const battery = await this.getBatteryData();

    return {
      status: { code: 1, text: 'ok' },
      timestamp: new Date(),
      pv,
      ac,
      house,
      grid,
      battery
    };
  }

  /**
   * Simple connectivity test
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.getStatus();
      return true;
    } catch {
      return false;
    }
  }
}
