import { SerialPort } from "serialport";
import { ModbusRTU, ModbusResponse, ModbusFunctionCode } from "./modbus-rtu";

/**
 * Interface pour les données des panneaux solaires PV
 */
export interface SolisPVData {
  pv1: {
    voltage: number; // Tension en V
    current: number; // Courant en A
    power: number; // Puissance en W
  };
  pv2: {
    voltage: number;
    current: number;
    power: number;
  };

  totalPowerDC: number; // Puissance DC totale en W
}

/**
 * Interface pour les données de puissance AC
 */
export interface SolisACData {
  totalPowerAC: number; // Puissance AC totale en W
  frequency: number; // Fréquence en Hz
  temperature: number; // Température de l'onduleur en °C
}

/**
 * Interface pour les données de la maison
 */
export interface SolisHouseData {
  consumption: number; // Consommation maison en W
  backupConsumption: number; // Consommation backup en W
}

/**
 * Interface pour les données du réseau électrique
 */
export interface SolisGridData {
  activePower: number; // Puissance active compteur (+ = injection, - = consommation)
  inverterPower: number; // Puissance onduleur vers réseau (+ = injection, - = soutirage)
  importedEnergyTotal: number; // Énergie importée totale en kWh
  exportedEnergyTotal: number; // Énergie exportée totale en kWh
}

/**
 * Interface pour les données de la batterie
 */
export interface SolisBatteryData {
  power: number; // Puissance batterie (+ = décharge, - = charge)
  soc: number; // État de charge en %
  voltage: number; // Tension batterie en V
  current: number; // Courant batterie en A
}

/**
 * Interface pour les données complètes de l'onduleur Solis
 */
export interface SolisInverterData {
  status: {
    code: number;
    text: string;
  };
  timestamp: Date;
  pv: SolisPVData;
  ac: SolisACData;
  house: SolisHouseData;
  grid: SolisGridData;
  battery: SolisBatteryData;
}

/**
 * Options de configuration pour la connexion Solis
 */
export interface SolisConnectionOptions {
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: "none" | "even" | "mark" | "odd" | "space";
  slaveId?: number;
  responseTimeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

/**
 * Classe haut niveau pour communiquer avec l'onduleur Solis S5-EH1P5K-L
 * Fournit des méthodes simples pour récupérer les données sans manipuler les registres
 */
export class SolisInverter {
  private portName: string;
  private options: Required<SolisConnectionOptions>;
  private port: SerialPort | null = null;
  private isConnected: boolean = false;
  
  // Délai entre les commandes Modbus (en ms)
  private static readonly COMMAND_DELAY = 200;

  // Mappage des registres Solis (adresses Modbus)
  private static readonly REGISTERS = {
    // Statut et informations générales
    STATUS: 33095, // Registre de statut de l'onduleur

    // Données PV (panneaux solaires)
    PV1_VOLTAGE: 33049,
    PV1_CURRENT: 33050,
    PV2_VOLTAGE: 33051,
    PV2_CURRENT: 33052,
    PV3_VOLTAGE: 33053,
    PV3_CURRENT: 33054,
    PV4_VOLTAGE: 33055,
    PV4_CURRENT: 33056,
    PV_TOTAL_POWER: 33057, // 2 registres pour puissance DC totale

    // Données AC
    AC_TOTAL_POWER: 33079,
    TEMPERATURE: 33093,

    // Données maison
    HOUSE_CONSUMPTION: 33147,
    BACKUP_CONSUMPTION: 33148,
    HOUSE_ENERGY_TOTAL: 33177, // 2 registres

    // Données réseau
    GRID_ACTIVE_POWER: 33130, // 2 registres
    INVERTER_AC_POWER: 33151, // 2 registres
    GRID_IMPORTED_ENERGY: 33169, // 2 registres
    GRID_EXPORTED_ENERGY: 33173, // 2 registres

    // Données batterie
    BATTERY_POWER: 33149, // 2 registres
    BATTERY_SOC: 33139,
    BATTERY_VOLTAGE: 33133,
    BATTERY_CURRENT: 33134
  };

  constructor(portName: string, options: SolisConnectionOptions = {}) {
    this.portName = portName;
    this.options = {
      baudRate: options.baudRate || 9600,
      dataBits: options.dataBits || 8,
      stopBits: options.stopBits || 1,
      parity: options.parity || "none",
      slaveId: options.slaveId || 1,
      responseTimeout: options.responseTimeout || 2000,
      retryCount: options.retryCount || 3,
      retryDelay: options.retryDelay || 500
    };
  }

  /**
   * Établit la connexion avec l'onduleur Solis
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    this.port = new SerialPort({
      path: this.portName,
      baudRate: this.options.baudRate,
      dataBits: this.options.dataBits,
      stopBits: this.options.stopBits,
      parity: this.options.parity
    });

    return new Promise((resolve, reject) => {
      this.port?.on("open", () => {
        this.isConnected = true;
        resolve();
      });

      this.port?.on("error", (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Ferme la connexion avec l'onduleur
   */
  async disconnect(): Promise<void> {
    if (this.port?.isOpen) {
      return new Promise((resolve) => {
        this.port?.close(() => {
          this.isConnected = false;
          resolve();
        });
      });
    }
  }

  /**
   * Lit un ou plusieurs registres Modbus
   */
  private async readRegisters(startAddr: number, quantity: number = 1): Promise<number[]> {
    if (!this.isConnected || !this.port) {
      throw new Error("Non connecté à l'onduleur");
    }

    const frame = ModbusRTU.createReadFrame(this.options.slaveId, ModbusFunctionCode.READ_INPUT_REGISTERS, startAddr, quantity);

    return new Promise((resolve, reject) => {
      let responseData = Buffer.alloc(0);
      let timeout: NodeJS.Timeout;

      const onData = (data: Buffer) => {
        responseData = Buffer.concat([responseData, data]);
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          this.port?.removeListener("data", onData);

          const response = ModbusRTU.parseResponse(responseData);
          if (!response || response.error) {
            reject(new Error(response?.error || "Réponse invalide"));
            return;
          }

          if (response.data) {
            const registers = ModbusRTU.parseRegisters(response.data);
            resolve(registers);
          } else {
            reject(new Error("Aucune donnée reçue"));
          }
        }, 200);
      };

      this.port?.on("data", onData);

      timeout = setTimeout(() => {
        this.port?.removeListener("data", onData);
        reject(new Error("Timeout"));
      }, this.options.responseTimeout);

      this.port?.write(frame, (err) => {
        if (err) {
          this.port?.removeListener("data", onData);
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  /**
   * Récupère les données des panneaux solaires PV
   */
  async getPVData(): Promise<SolisPVData> {
    // Lecture séquentielle pour éviter les conflits avec l'onduleur
    const totalPowerRegs = await this.readRegisters(SolisInverter.REGISTERS.PV_TOTAL_POWER, 2);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY)); // Délai comme dans l'ancien code

    const pv1Voltage = await this.readRegisters(SolisInverter.REGISTERS.PV1_VOLTAGE);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const pv1Current = await this.readRegisters(SolisInverter.REGISTERS.PV1_CURRENT);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const pv2Voltage = await this.readRegisters(SolisInverter.REGISTERS.PV2_VOLTAGE);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const pv2Current = await this.readRegisters(SolisInverter.REGISTERS.PV2_CURRENT);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const pv1V = (pv1Voltage[0] || 0) / 10;
    const pv1A = (pv1Current[0] || 0) / 10;
    const pv2V = (pv2Voltage[0] || 0) / 10;
    const pv2A = (pv2Current[0] || 0) / 10;

    const totalPowerDC =
      totalPowerRegs.length >= 2
        ? (totalPowerRegs[0]! << 16) | totalPowerRegs[1]! // Si 2 registres, combiner
        : totalPowerRegs[0] || 0; // Si 1 registre, utiliser directement

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
   * Récupère les données de puissance AC
   */
  async getACData(): Promise<SolisACData> {
    const powerRegs = await this.readRegisters(SolisInverter.REGISTERS.AC_TOTAL_POWER);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const tempRegs = await this.readRegisters(SolisInverter.REGISTERS.TEMPERATURE);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    return {
      totalPowerAC: ((powerRegs[0] || 0) / 100) * 1000, // Conversion en W
      frequency: 50, // Fréquence fixe pour l'Europe
      temperature: (tempRegs[0] || 0) / 10
    };
  }

  /**
   * Récupère les données de consommation de la maison
   */
  async getHouseData(): Promise<SolisHouseData> {
    const consumption = await this.readRegisters(SolisInverter.REGISTERS.HOUSE_CONSUMPTION);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const backupConsumption = await this.readRegisters(SolisInverter.REGISTERS.BACKUP_CONSUMPTION);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    return {
      consumption: consumption[0] || 0,
      backupConsumption: backupConsumption[0] || 0
    };
  }

  /**
   * Récupère les données du réseau électrique
   */
  async getGridData(): Promise<SolisGridData> {
    const activePowerRegs = await this.readRegisters(SolisInverter.REGISTERS.GRID_ACTIVE_POWER, 2);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const inverterPowerRegs = await this.readRegisters(SolisInverter.REGISTERS.INVERTER_AC_POWER, 2);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const importedEnergyRegs = await this.readRegisters(SolisInverter.REGISTERS.GRID_IMPORTED_ENERGY, 2);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const exportedEnergyRegs = await this.readRegisters(SolisInverter.REGISTERS.GRID_EXPORTED_ENERGY, 2);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const activePower = activePowerRegs.length >= 2 ? (activePowerRegs[0]! << 16) | activePowerRegs[1]! : 0;

    const inverterPower = inverterPowerRegs.length >= 2 ? (inverterPowerRegs[0]! << 16) | inverterPowerRegs[1]! : 0;

    const importedEnergy = importedEnergyRegs.length >= 2 ? ((importedEnergyRegs[0]! << 16) | importedEnergyRegs[1]!) / 1000 : 0;

    const exportedEnergy = exportedEnergyRegs.length >= 2 ? ((exportedEnergyRegs[0]! << 16) | exportedEnergyRegs[1]!) / 1000 : 0;

    return {
      activePower,
      inverterPower,
      importedEnergyTotal: importedEnergy,
      exportedEnergyTotal: exportedEnergy
    };
  }

  /**
   * Récupère les données de la batterie
   */
  async getBatteryData(): Promise<SolisBatteryData> {
    const batteryPowerRegs = await this.readRegisters(SolisInverter.REGISTERS.BATTERY_POWER, 2);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const socRegs = await this.readRegisters(SolisInverter.REGISTERS.BATTERY_SOC);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const voltageRegs = await this.readRegisters(SolisInverter.REGISTERS.BATTERY_VOLTAGE);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const currentRegs = await this.readRegisters(SolisInverter.REGISTERS.BATTERY_CURRENT);
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const batteryPower = batteryPowerRegs.length >= 2 ? (batteryPowerRegs[0]! << 16) | batteryPowerRegs[1]! : 0;

    return {
      power: batteryPower,
      soc: socRegs[0] || 0, // SOC déjà en pourcentage, pas de division
      voltage: (voltageRegs[0] || 0) / 10,
      current: (currentRegs[0] || 0) / 10
    };
  }

  /**
   * Récupère le statut de l'onduleur
   */
  async getStatus(): Promise<{ code: number; text: string }> {
    const statusRegs = await this.readRegisters(SolisInverter.REGISTERS.STATUS);
    const statusCode = statusRegs[0] || 0;

    const statusMap: { [key: number]: string } = {
      0: "Standby",
      1: "Checking",
      2: "Normal",
      3: "Fault",
      4: "Permanent Fault"
    };

    return {
      code: statusCode,
      text: statusMap[statusCode] || "Unknown"
    };
  }

  /**
   * Récupère toutes les données de l'onduleur en une seule fois
   */
  async getAllData(): Promise<SolisInverterData> {
    const status = await this.getStatus();
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const pv = await this.getPVData();
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const ac = await this.getACData();
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const house = await this.getHouseData();
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const grid = await this.getGridData();
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    const battery = await this.getBatteryData();
    await new Promise((resolve) => setTimeout(resolve, SolisInverter.COMMAND_DELAY));

    return {
      status,
      timestamp: new Date(),
      pv,
      ac,
      house,
      grid,
      battery
    };
  }

  /**
   * Test de connectivité simple
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getStatus();
      return true;
    } catch {
      return false;
    }
  }
}
