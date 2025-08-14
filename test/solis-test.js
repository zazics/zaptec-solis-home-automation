const RS485Tester = require("./rs485-test");

/**
 * Classe pour tester la communication avec l'onduleur Solis S5-EH1P5K-L
 * Hérite de RS485Tester et ajoute les fonctionnalités Modbus spécifiques
 */
class SolisInverterTester extends RS485Tester {
  /**
   * Constructeur de la classe SolisInverterTester
   * @param {string} portName - Nom du port série (ex: /dev/ttyACM0 ou COM1)
   * @param {Object} options - Options de configuration
   * @param {number} options.baudRate - Vitesse de communication (défaut: 9600)
   * @param {number} options.slaveId - ID de l'esclave Modbus (défaut: 1)
   * @param {number} options.responseTimeout - Timeout pour les réponses (défaut: 2000ms)
   */
  constructor(portName, options = {}) {
    super(portName, {
      baudRate: options.baudRate || 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      ...options
    });
    this.slaveId = options.slaveId || 1;
    this.responseTimeout = options.responseTimeout || 2000;
  }

  /**
   * Calcule le CRC16 pour les trames Modbus RTU
   * @param {Array|Buffer} data - Données pour lesquelles calculer le CRC
   * @returns {Array} Tableau contenant les 2 bytes du CRC [Low, High]
   */
  calculateCRC(data) {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) {
          crc = (crc >> 1) ^ 0xa001;
        } else {
          crc = crc >> 1;
        }
      }
    }
    return [crc & 0xff, (crc >> 8) & 0xff];
  }

  /**
   * Crée une trame Modbus RTU complète avec CRC
   * @param {number} functionCode - Code de fonction Modbus (ex: 0x03, 0x04)
   * @param {number} startAddr - Adresse de début des registres
   * @param {number} quantity - Nombre de registres à lire
   * @returns {Buffer} Trame Modbus complète prête à envoyer
   */
  createModbusFrame(functionCode, startAddr, quantity) {
    const frame = [this.slaveId, functionCode, (startAddr >> 8) & 0xff, startAddr & 0xff, (quantity >> 8) & 0xff, quantity & 0xff];
    const crc = this.calculateCRC(frame);
    return Buffer.from([...frame, ...crc]);
  }

  /**
   * Envoie une commande Modbus et attend la réponse
   * @param {number} functionCode - Code de fonction Modbus (0x03 ou 0x04)
   * @param {number} startAddr - Adresse du registre de début
   * @param {number} quantity - Nombre de registres à lire
   * @param {string} description - Description pour l'affichage
   * @returns {Promise<Buffer|null>} Données reçues ou null en cas de timeout
   */
  async sendModbusCommand(functionCode, startAddr, quantity, description) {
    console.log(`\n=== ${description} ===`);
    const frame = this.createModbusFrame(functionCode, startAddr, quantity);

    return new Promise((resolve) => {
      let responseData = Buffer.alloc(0);
      let timeout;

      const onData = (data) => {
        responseData = Buffer.concat([responseData, data]);
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          this.port.removeListener("data", onData);
          this.parseResponse(responseData, description, startAddr, quantity);
          resolve(responseData);
        }, 200);
      };

      this.port.on("data", onData);

      timeout = setTimeout(() => {
        this.port.removeListener("data", onData);
        console.log("✗ Timeout - Aucune réponse");
        resolve(null);
      }, this.responseTimeout);

      this.sendData(frame).catch((err) => {
        console.error("✗ Erreur envoi:", err.message);
        resolve(null);
      });
    });
  }

  /**
   * Analyse et affiche la réponse Modbus reçue
   * @param {Buffer} data - Données reçues de l'onduleur
   * @param {string} description - Description du test
   * @param {number} startAddr - Adresse du registre lu
   * @param {number} quantity - Nombre de registres lus
   */
  parseResponse(data, description, startAddr, quantity) {
    if (!data || data.length < 5) {
      console.log("✗ Réponse invalide ou trop courte");
      return;
    }

    const slaveId = data[0];
    const functionCode = data[1];
    const dataLength = data[2];

    if (dataLength > 0 && data.length >= 3 + dataLength) {
      const responseData = data.slice(3, 3 + dataLength);
      this.interpretSolisData(responseData, startAddr, description, quantity);
    }
  }

  /**
   * Interprète les données spécifiques de l'onduleur Solis
   * Convertit les valeurs brutes en unités lisibles (kW, V, A, °C)
   * @param {Buffer} data - Données des registres Modbus
   * @param {number} startAddr - Adresse du registre de début
   * @param {string} description - Description du registre
   * @param {number} quantity - Nombre de registres lus
   */
  interpretSolisData(data, startAddr, description, quantity = 1) {
    try {
      const registers = [];
      for (let i = 0; i < data.length; i += 2) {
        if (i + 1 < data.length) {
          const value = (data[i] << 8) | data[i + 1];
          registers.push(value);
        }
      }

      switch (startAddr) {
        case 33057:
          if (quantity === 2 && registers.length >= 2) {
            const totalPower = (registers[0] << 16) | registers[1];
            console.log(`  → 🔋 PUISSANCE DC TOTALE: ${totalPower} W (${totalPower / 1000} kW)`);
          } else if (registers[0] !== undefined) {
            console.log(`  → Statut: ${registers[0]} (${this.getStatusText(registers[0])})`);
          }
          break;
        case 33079:
          if (registers[0] !== undefined) {
            const powerAC = registers[0] / 100; // Conversion en kW
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
            const meterPower = (registers[0] << 16) | registers[1];
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
            const inverterPower = (registers[0] << 16) | registers[1];
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
            const batteryPower = (registers[0] << 16) | registers[1];
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
            const energy = (registers[0] << 16) | registers[1];
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
      console.log("  → Erreur interprétation:", error.message);
    }
  }

  /**
   * Convertit le code de statut numérique en texte lisible
   * @param {number} status - Code de statut de l'onduleur
   * @returns {string} Description textuelle du statut
   */
  getStatusText(status) {
    const statusMap = {
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
   * @returns {Promise<boolean>} true si connexion réussie, false sinon
   */
  async testConnection() {
    console.log("=== TEST DE CONNEXION SOLIS S5-EH1P5K-L ===\n");

    try {
      await this.connect();
      console.log("✓ Connexion établie avec l'onduleur");
      return true;
    } catch (error) {
      console.error("✗ Erreur de connexion:", error.message);
      return false;
    }
  }

  /**
   * Lance une série de tests pour lire toutes les données importantes de l'onduleur
   * Lit les puissances PV1/PV2, tensions, courants, température et statut
   */
  async runInverterTests() {
    const tests = [
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
  async runSolarPowerTest() {
    const tests = [
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
  async runHousePowerTest() {
    const tests = [
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
}

/**
 * Fonction principale pour tester l'onduleur Solis
 * Parse les arguments de ligne de commande et lance les tests
 */
async function testSolisInverter() {
  const args = process.argv.slice(2);
  const defaultPort = process.platform === "win32" ? "COM4" : "/dev/ttyACM0";
  const portName = args.find((arg) => arg.startsWith("--port="))?.split("=")[1] || defaultPort;
  const baudRate = parseInt(args.find((arg) => arg.startsWith("--baud="))?.split("=")[1]) || 9600;
  const slaveId = parseInt(args.find((arg) => arg.startsWith("--slave="))?.split("=")[1]) || 1;

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
    console.error("✗ Erreur pendant les tests:", error.message);
  } finally {
    await inverter.disconnect();
  }
}

if (require.main === module) {
  console.log("=== TEST ONDULEUR SOLIS S5-EH1P5K-L ===\n");
  console.log("Usage:");
  if (process.platform === "win32") {
    console.log("  node solis-test.js --port=COM1 --baud=9600 --slave=1");
    console.log("  node solis-test.js --port=COM4 --baud=115200 --slave=2");
  } else {
    console.log("  node solis-test.js --port=/dev/ttyACM0 --baud=9600 --slave=1");
    console.log("  node solis-test.js --port=/dev/ttyUSB0 --baud=115200 --slave=2");
  }
  console.log("");
  console.log("Registres Modbus Solis typiques:");
  console.log("  3004-3005: Puissance AC active (W)");
  console.log("  3021-3022: Puissance DC totale (W)");
  console.log("  3035: Tension DC PV1 (0.1V)");
  console.log("  3036: Courant DC PV1 (0.1A)");
  console.log("  3041: Température inverter (0.1°C)");
  console.log("  3043: Statut onduleur");
  console.log("");

  testSolisInverter().catch(console.error);
}

module.exports = SolisInverterTester;
