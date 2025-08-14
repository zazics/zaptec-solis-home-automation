import { SerialPort } from "serialport";
import { ModbusRTU, ModbusResponse, ModbusFunctionCode } from "../modbus-rtu";

interface SolisOptions {
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: string;
  slaveId?: number;
  responseTimeout?: number;
}

interface ModbusTest {
  addr: number;
  qty: number;
  desc: string;
}

interface StatusMap {
  [key: number]: string;
}

/**
 * Classe pour tester la communication avec l'onduleur Solis S5-EH1P5K-L
 * Hérite de RS485Tester et ajoute les fonctionnalités Modbus spécifiques
 */
class SolisInverterTester {
  private portName: string;
  private options: Required<SolisOptions>;
  private port: SerialPort | null = null;
  private isConnected: boolean = false;
  private slaveId: number;
  private responseTimeout: number;

  /**
   * Constructeur de la classe SolisInverterTester
   * @param portName - Nom du port série (ex: /dev/ttyACM0 ou COM1)
   * @param options - Options de configuration
   */
  constructor(portName: string, options: SolisOptions = {}) {
    this.portName = portName;
    this.options = {
      baudRate: options.baudRate || 9600,
      dataBits: options.dataBits || 8,
      stopBits: options.stopBits || 1,
      parity: options.parity || "none",
      slaveId: options.slaveId || 1,
      responseTimeout: options.responseTimeout || 2000
    };
    this.slaveId = this.options.slaveId;
    this.responseTimeout = this.options.responseTimeout;
  }

  /**
   * Crée une trame Modbus RTU complète avec CRC
   * @param functionCode - Code de fonction Modbus (ex: 0x03, 0x04)
   * @param startAddr - Adresse de début des registres
   * @param quantity - Nombre de registres à lire
   * @returns Trame Modbus complète prête à envoyer
   */
  private createModbusFrame(functionCode: number, startAddr: number, quantity: number): Buffer {
    return ModbusRTU.createReadFrame(this.slaveId, functionCode, startAddr, quantity);
  }

  /**
   * Envoie une commande Modbus et attend la réponse
   * @param functionCode - Code de fonction Modbus (0x03 ou 0x04)
   * @param startAddr - Adresse du registre de début
   * @param quantity - Nombre de registres à lire
   * @param description - Description pour l'affichage
   * @returns Données reçues ou null en cas de timeout
   */
  async sendModbusCommand(functionCode: number, startAddr: number, quantity: number, description: string): Promise<Buffer | null> {
    console.log(`\n=== ${description} ===`);
    const frame = this.createModbusFrame(functionCode, startAddr, quantity);

    return new Promise((resolve) => {
      let responseData = Buffer.alloc(0);
      let timeout: NodeJS.Timeout;

      const onData = (data: Buffer) => {
        responseData = Buffer.concat([responseData, data]);
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          this.port?.removeListener("data", onData);
          this.parseResponse(responseData, description, startAddr, quantity);
          resolve(responseData);
        }, 200);
      };

      this.port?.on("data", onData);

      timeout = setTimeout(() => {
        this.port?.removeListener("data", onData);
        console.log("✗ Timeout - Aucune réponse");
        resolve(null);
      }, this.responseTimeout);

      this.sendData(frame).catch((err: Error) => {
        console.error("✗ Erreur envoi:", err.message);
        resolve(null);
      });
    });
  }

  /**
   * Envoie des données via le port série
   * @param data - Données à envoyer
   */
  private async sendData(data: Buffer): Promise<void> {
    if (!this.isConnected || !this.port || !this.port.isOpen) {
      throw new Error("Port non connecté");
    }

    return new Promise((resolve, reject) => {
      console.log("→ Envoi:", ModbusRTU.bufferToHex(data));

      this.port?.write(data, (err?: Error | null) => {
        if (err) {
          console.error("✗ Erreur d'envoi:", err.message);
          reject(err);
        } else {
          console.log("✓ Données envoyées");
          resolve();
        }
      });
    });
  }

  /**
   * Analyse et affiche la réponse Modbus reçue
   * @param data - Données reçues de l'onduleur
   * @param description - Description du test
   * @param startAddr - Adresse du registre lu
   * @param quantity - Nombre de registres lus
   */
  private parseResponse(data: Buffer, description: string, startAddr: number, quantity: number): void {
    const response = ModbusRTU.parseResponse(data);

    if (!response) {
      console.log("✗ Réponse invalide ou trop courte");
      return;
    }

    if (response.error) {
      console.log(`✗ Erreur Modbus: ${response.error}`);
      return;
    }

    if (response.data) {
      this.interpretSolisData(response.data, startAddr, description, quantity);
    }
  }

  /**
   * Interprète les données spécifiques de l'onduleur Solis
   * Convertit les valeurs brutes en unités lisibles (kW, V, A, °C)
   * @param data - Données des registres Modbus
   * @param startAddr - Adresse du registre de début
   * @param description - Description du registre
   * @param quantity - Nombre de registres lus
   */
  private interpretSolisData(data: Buffer, startAddr: number, description: string, quantity: number = 1): void {
    try {
      const registers = ModbusRTU.parseRegisters(data);

      switch (startAddr) {
        case 33057:
          if (quantity === 2 && registers.length >= 2) {
            const totalPower = (registers[0]! << 16) | registers[1]!;
            console.log(`  → 🔋 PUISSANCE DC TOTALE: ${totalPower} W (${totalPower / 1000} kW)`);
          } else if (registers[0] !== undefined) {
            console.log(`  → Statut: ${registers[0]} (${this.getStatusText(registers[0])})`);
          }
          break;
        case 33079:
          if (registers[0] !== undefined) {
            const powerAC = registers[0] / 100;
            console.log(`  → ⚡ PUISSANCE AC TOTALE: ${powerAC} kW`);
          }
          break;
        case 33049:
        case 33051:
        case 33053:
        case 33055:
          if (registers[0] !== undefined) {
            const voltage = registers[0] / 10;
            const pvNumber = Math.floor((startAddr - 33049) / 2) + 1;
            console.log(`  → 🔌 Tension DC${pvNumber}: ${voltage} V`);
          }
          break;
        case 33050:
        case 33052:
        case 33054:
        case 33056:
          if (registers[0] !== undefined) {
            const current = registers[0] / 10;
            const pvNumber = Math.floor((startAddr - 33050) / 2) + 1;
            console.log(`  → ⚡ Courant DC${pvNumber}: ${current} A`);
          }
          break;
        case 33093:
          if (registers[0] !== undefined) {
            const temp = registers[0] / 10;
            console.log(`  → Température: ${temp} °C`);
          }
          break;
        case 33147:
          if (registers[0] !== undefined) {
            console.log(`  → 🏠 CONSOMMATION MAISON: ${registers[0]} W (${(registers[0] / 1000).toFixed(2)} kW)`);
          }
          break;
        case 33148:
          if (registers[0] !== undefined) {
            console.log(`  → 🔌 CONSOMMATION BACKUP: ${registers[0]} W (${(registers[0] / 1000).toFixed(2)} kW)`);
          }
          break;
        case 33130:
          if (quantity === 2 && registers.length >= 2) {
            const meterPower = (registers[0]! << 16) | registers[1]!;
            const powerKW = meterPower / 1000;
            if (meterPower > 0) {
              console.log(`  → ⚡ INJECTION RESEAU: ${meterPower} W (${powerKW.toFixed(2)} kW)`);
            } else {
              console.log(`  → ⚡ CONSOMMATION RESEAU: ${Math.abs(meterPower)} W (${Math.abs(powerKW).toFixed(2)} kW)`);
            }
          }
          break;
        case 33151:
          if (quantity === 2 && registers.length >= 2) {
            const inverterPower = (registers[0]! << 16) | registers[1]!;
            const powerKW = inverterPower / 1000;
            if (inverterPower > 0) {
              console.log(`  → 🔄 INJECTION VERS RESEAU: ${inverterPower} W (${powerKW.toFixed(2)} kW)`);
            } else {
              console.log(`  → 🔄 SOUTIRAGE RESEAU: ${Math.abs(inverterPower)} W (${Math.abs(powerKW).toFixed(2)} kW)`);
            }
          }
          break;
        case 33149:
          if (quantity === 2 && registers.length >= 2) {
            const batteryPower = (registers[0]! << 16) | registers[1]!;
            const powerKW = batteryPower / 1000;
            if (batteryPower > 0) {
              console.log(`  → 🔋 BATTERIE DÉCHARGE: ${batteryPower} W (${powerKW.toFixed(2)} kW)`);
            } else {
              console.log(`  → 🔋 BATTERIE CHARGE: ${Math.abs(batteryPower)} W (${Math.abs(powerKW).toFixed(2)} kW)`);
            }
          }
          break;
        case 33169:
        case 33173:
        case 33177:
          if (quantity === 2 && registers.length >= 2) {
            const energy = (registers[0]! << 16) | registers[1]!;
            const energyKWh = energy / 1000;
            let description = "";
            switch (startAddr) {
              case 33169:
                description = "📊 ENERGIE IMPORTEE RESEAU";
                break;
              case 33173:
                description = "📈 ENERGIE INJECTEE RESEAU";
                break;
              case 33177:
                description = "🏠 ENERGIE CONSOMMEE MAISON";
                break;
            }
            console.log(`  → ${description}: ${energyKWh.toFixed(1)} kWh`);
          }
          break;
        default:
          // Données non interprétées - pas d'affichage
          break;
      }
    } catch (error) {
      console.log("  → Erreur interprétation:", (error as Error).message);
    }
  }

  /**
   * Convertit le code de statut numérique en texte lisible
   * @param status - Code de statut de l'onduleur
   * @returns Description textuelle du statut
   */
  private getStatusText(status: number): string {
    const statusMap: StatusMap = {
      0: "Standby",
      1: "Checking",
      2: "Normal",
      3: "Fault",
      4: "Permanent Fault"
    };
    return statusMap[status] || "Unknown";
  }

  /**
   * Teste la connexion avec l'onduleur Solis
   * @returns true si connexion réussie, false sinon
   */
  async testConnection(): Promise<boolean> {
    console.log("=== TEST DE CONNEXION SOLIS S5-EH1P5K-L ===\n");

    try {
      await this.connect();
      console.log("✓ Connexion établie avec l'onduleur");
      return true;
    } catch (error) {
      console.error("✗ Erreur de connexion:", (error as Error).message);
      return false;
    }
  }

  /**
   * Établit la connexion avec le port série
   */
  async connect(): Promise<void> {
    try {
      this.port = new SerialPort({
        path: this.portName,
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits as 5 | 6 | 7 | 8,
        stopBits: this.options.stopBits as 1 | 1.5 | 2,
        parity: this.options.parity as "none" | "even" | "mark" | "odd" | "space"
      });

      return new Promise((resolve, reject) => {
        this.port?.on("open", () => {
          console.log(`✓ Connecté au port ${this.portName}`);
          this.isConnected = true;
          resolve();
        });

        this.port?.on("error", (err: Error) => {
          console.error("✗ Erreur de connexion:", err.message);
          reject(err);
        });

        this.port?.on("data", (data: Buffer) => {
          console.log("← Données reçues:", ModbusRTU.bufferToHex(data));
          console.log("← ASCII:", data.toString().replace(/[^\x20-\x7E]/g, "."));
        });
      });
    } catch (error) {
      console.error("✗ Erreur lors de l'ouverture du port:", (error as Error).message);
      throw error;
    }
  }

  /**
   * Ferme la connexion avec le port série
   */
  async disconnect(): Promise<void> {
    if (this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        this.port?.close(() => {
          console.log("✓ Port fermé");
          this.isConnected = false;
          resolve();
        });
      });
    }
  }

  /**
   * Lance une série de tests pour lire toutes les données importantes de l'onduleur
   * Lit les puissances PV1/PV2, tensions, courants, température et statut
   */
  async runInverterTests(): Promise<void> {
    const tests: ModbusTest[] = [
      { addr: 33057, qty: 1, desc: "Statut onduleur" },
      { addr: 33079, qty: 1, desc: "Puissance AC totale (kW)" },
      { addr: 33049, qty: 1, desc: "Tension DC PV1 (V)" },
      { addr: 33050, qty: 1, desc: "Courant DC PV1 (A)" },
      { addr: 33051, qty: 1, desc: "Tension DC PV2 (V)" },
      { addr: 33052, qty: 1, desc: "Courant DC PV2 (A)" },
      { addr: 33057, qty: 2, desc: "🔋 PUISSANCE PV TOTALE (W)" },
      { addr: 33093, qty: 1, desc: "Température inverter (°C)" }
    ];

    console.log("\n=== LECTURE DES DONNÉES PRINCIPALES ===");

    for (const test of tests) {
      await this.sendModbusCommand(0x04, test.addr, test.qty, test.desc);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Test spécifique pour lire la puissance des panneaux solaires selon la doc Solis
   */
  async runSolarPowerTest(): Promise<void> {
    const tests: ModbusTest[] = [
      { addr: 33057, qty: 2, desc: "🔋 PUISSANCE DC TOTALE PV (W)" },
      { addr: 33049, qty: 1, desc: "Tension DC Voltage 1 (0.1V)" },
      { addr: 33050, qty: 1, desc: "Courant DC Current 1 (0.1A)" },
      { addr: 33051, qty: 1, desc: "Tension DC Voltage 2 (0.1V)" },
      { addr: 33052, qty: 1, desc: "Courant DC Current 2 (0.1A)" },
      { addr: 33053, qty: 1, desc: "Tension DC Voltage 3 (0.1V)" },
      { addr: 33054, qty: 1, desc: "Courant DC Current 3 (0.1A)" },
      { addr: 33055, qty: 1, desc: "Tension DC Voltage 4 (0.1V)" },
      { addr: 33056, qty: 1, desc: "Courant DC Current 4 (0.1A)" }
    ];

    console.log("\n=== LECTURE PUISSANCE PANNEAUX SOLAIRES ===");

    for (const test of tests) {
      await this.sendModbusCommand(0x04, test.addr, test.qty, test.desc);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Test pour lire la consommation de la maison et l'injection réseau
   */
  async runHousePowerTest(): Promise<void> {
    const tests: ModbusTest[] = [
      { addr: 33147, qty: 1, desc: "🏠 CONSOMMATION MAISON (W)" },
      { addr: 33148, qty: 1, desc: "🔌 CONSOMMATION BACKUP (W)" },
      { addr: 33130, qty: 2, desc: "⚡ PUISSANCE ACTIVE COMPTEUR (W)" },
      { addr: 33151, qty: 2, desc: "🔄 PUISSANCE INVERTER AC GRID (W)" },
      { addr: 33149, qty: 2, desc: "🔋 PUISSANCE BATTERIE (W)" },
      { addr: 33169, qty: 2, desc: "📊 ENERGIE IMPORTEE RESEAU TOTALE (kWh)" },
      { addr: 33173, qty: 2, desc: "📈 ENERGIE INJECTEE RESEAU TOTALE (kWh)" },
      { addr: 33177, qty: 2, desc: "🏠 ENERGIE CONSOMMEE MAISON TOTALE (kWh)" }
    ];

    console.log("\n=== LECTURE CONSOMMATION MAISON ET RESEAU ===");

    for (const test of tests) {
      await this.sendModbusCommand(0x04, test.addr, test.qty, test.desc);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Liste les ports série disponibles
   */
  static async listPorts(): Promise<any[]> {
    try {
      const ports = await SerialPort.list();
      console.log("\n=== Ports série disponibles ===");
      ports.forEach((port, index) => {
        console.log(`${index + 1}. ${port.path}`);
        if (port.manufacturer) console.log(`   Fabricant: ${port.manufacturer}`);
        if (port.productId) console.log(`   Product ID: ${port.productId}`);
        if (port.vendorId) console.log(`   Vendor ID: ${port.vendorId}`);
        console.log("");
      });
      return ports;
    } catch (error) {
      console.error("✗ Erreur lors de la liste des ports:", (error as Error).message);
      throw error;
    }
  }
}

/**
 * Fonction principale pour tester l'onduleur Solis
 * Parse les arguments de ligne de commande et lance les tests
 */
async function testSolisInverter(): Promise<void> {
  const args = process.argv.slice(2);
  const defaultPort = process.platform === "win32" ? "COM4" : "/dev/ttyACM0";
  const portName = args.find((arg) => arg.startsWith("--port="))?.split("=")[1] || defaultPort;
  const baudRate = parseInt(args.find((arg) => arg.startsWith("--baud="))?.split("=")[1] || "9600");
  const slaveId = parseInt(args.find((arg) => arg.startsWith("--slave="))?.split("=")[1] || "1");

  console.log(`Paramètres:`);
  console.log(`  Port: ${portName}`);
  console.log(`  Baud Rate: ${baudRate}`);
  console.log(`  Slave ID: ${slaveId}\n`);

  const inverter = new SolisInverterTester(portName, {
    baudRate: baudRate,
    slaveId: slaveId,
    responseTimeout: 3000
  });

  try {
    const connected = await inverter.testConnection();

    if (connected) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log("\n=== TEST BASIQUE - LECTURE REGISTRE STATUT ===");
      await inverter.sendModbusCommand(0x04, 33057, 1, "Test connexion - Statut");

      await new Promise((resolve) => setTimeout(resolve, 1000));
      await inverter.runInverterTests();

      await new Promise((resolve) => setTimeout(resolve, 1000));
      await inverter.runSolarPowerTest();

      await new Promise((resolve) => setTimeout(resolve, 1000));
      await inverter.runHousePowerTest();
    }
  } catch (error) {
    console.error("✗ Erreur pendant les tests:", (error as Error).message);
  } finally {
    await inverter.disconnect();
  }
}

if (require.main === module) {
  console.log("=== TEST ONDULEUR SOLIS S5-EH1P5K-L ===\n");
  console.log("Usage:");
  if (process.platform === "win32") {
    console.log("  ts-node solis-test.ts --port=COM1 --baud=9600 --slave=1");
    console.log("  ts-node solis-test.ts --port=COM4 --baud=115200 --slave=2");
  } else {
    console.log("  ts-node solis-test.ts --port=/dev/ttyACM0 --baud=9600 --slave=1");
    console.log("  ts-node solis-test.ts --port=/dev/ttyUSB0 --baud=115200 --slave=2");
  }
  console.log("");
  console.log("Registres Modbus Solis typiques:");
  console.log("  33057-33058: Puissance DC totale (W)");
  console.log("  33049-33056: Tensions et courants DC (0.1V/0.1A)");
  console.log("  33147: Consommation maison (W)");
  console.log("  33130: Puissance active compteur (W)");
  console.log("  33093: Température inverter (0.1°C)");
  console.log("");

  testSolisInverter().catch(console.error);
}

export default SolisInverterTester;
