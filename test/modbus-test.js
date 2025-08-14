const RS485Tester = require("./rs485-test");

class ModbusRTUTester extends RS485Tester {
  constructor(portName, options = {}) {
    super(portName, options);
    this.responseTimeout = options.responseTimeout || 1000;
  }

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

  createModbusFrame(slaveId, functionCode, data) {
    const frame = [slaveId, functionCode, ...data];
    const crc = this.calculateCRC(frame);
    return Buffer.from([...frame, ...crc]);
  }

  async readHoldingRegisters(slaveId, startAddress, quantity) {
    const data = [(startAddress >> 8) & 0xff, startAddress & 0xff, (quantity >> 8) & 0xff, quantity & 0xff];

    const frame = this.createModbusFrame(slaveId, 0x03, data);
    console.log(`\n=== Lecture registres (Slave ${slaveId}, Addr ${startAddress}, Qty ${quantity}) ===`);

    return this.sendAndWaitResponse(frame);
  }

  async readInputRegisters(slaveId, startAddress, quantity) {
    const data = [(startAddress >> 8) & 0xff, startAddress & 0xff, (quantity >> 8) & 0xff, quantity & 0xff];

    const frame = this.createModbusFrame(slaveId, 0x04, data);
    console.log(`\n=== Lecture entrées (Slave ${slaveId}, Addr ${startAddress}, Qty ${quantity}) ===`);

    return this.sendAndWaitResponse(frame);
  }

  async writeSingleRegister(slaveId, address, value) {
    const data = [(address >> 8) & 0xff, address & 0xff, (value >> 8) & 0xff, value & 0xff];

    const frame = this.createModbusFrame(slaveId, 0x06, data);
    console.log(`\n=== Écriture registre (Slave ${slaveId}, Addr ${address}, Value ${value}) ===`);

    return this.sendAndWaitResponse(frame);
  }

  async sendAndWaitResponse(frame) {
    return new Promise((resolve, reject) => {
      let responseData = Buffer.alloc(0);
      let timeout;

      const onData = (data) => {
        responseData = Buffer.concat([responseData, data]);
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          this.port.removeListener("data", onData);
          resolve(responseData);
        }, 100);
      };

      this.port.on("data", onData);

      timeout = setTimeout(() => {
        this.port.removeListener("data", onData);
        resolve(null);
      }, this.responseTimeout);

      this.sendData(frame).catch(reject);
    });
  }
}

async function runModbusTests() {
  console.log("=== Tests Modbus RTU via RS485 ===\n");

  const args = process.argv.slice(2);
  const portName = args.find((arg) => arg.startsWith("--port="))?.split("=")[1] || "COM3";
  const baudRate = parseInt(args.find((arg) => arg.startsWith("--baud="))?.split("=")[1]) || 9600;
  const slaveId = parseInt(args.find((arg) => arg.startsWith("--slave="))?.split("=")[1]) || 1;

  const tester = new ModbusRTUTester(portName, {
    baudRate: baudRate,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    responseTimeout: 2000
  });

  try {
    await tester.connect();

    console.log("\n=== Test 1: Lecture de registres d'entrée ===");
    const inputResponse = await tester.readInputRegisters(slaveId, 0, 2);
    if (inputResponse) {
      console.log("✓ Réponse reçue");
    } else {
      console.log("✗ Aucune réponse (timeout)");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("\n=== Test 2: Lecture de registres de maintien ===");
    const holdingResponse = await tester.readHoldingRegisters(slaveId, 0, 2);
    if (holdingResponse) {
      console.log("✓ Réponse reçue");
    } else {
      console.log("✗ Aucune réponse (timeout)");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("\n=== Test 3: Écriture d'un registre ===");
    const writeResponse = await tester.writeSingleRegister(slaveId, 0, 100);
    if (writeResponse) {
      console.log("✓ Réponse reçue");
    } else {
      console.log("✗ Aucune réponse (timeout)");
    }
  } catch (error) {
    console.error("✗ Erreur pendant les tests Modbus:", error.message);
  } finally {
    await tester.disconnect();
  }
}

if (require.main === module) {
  console.log("Usage:");
  console.log("  node modbus-test.js --port=COM3 --baud=9600 --slave=1");
  console.log("  node modbus-test.js --port=COM1 --baud=115200 --slave=2");
  console.log("");

  runModbusTests().catch(console.error);
}

module.exports = ModbusRTUTester;
