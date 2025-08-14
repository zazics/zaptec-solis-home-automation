const RS485Tester = require("./rs485-test");

class RS485LoopbackTester extends RS485Tester {
  constructor(portName, options = {}) {
    super(portName, options);
    this.receivedData = [];
    this.testResults = [];
  }

  async connect() {
    await super.connect();

    this.port.on("data", (data) => {
      this.receivedData.push({
        timestamp: Date.now(),
        data: data
      });
    });
  }

  async sendAndVerify(testData, testName, expectedResponse = null) {
    console.log(`\n=== ${testName} ===`);

    this.receivedData = [];
    const sentBuffer = Buffer.isBuffer(testData) ? testData : Buffer.from(testData, "hex");
    const expected = expectedResponse || sentBuffer;

    const startTime = Date.now();
    await this.sendData(sentBuffer);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const success = this.verifyResponse(expected, testName);
        resolve(success);
      }, 1000);

      const checkData = () => {
        if (this.receivedData.length > 0) {
          clearTimeout(timeout);
          const success = this.verifyResponse(expected, testName);
          resolve(success);
        }
      };

      const interval = setInterval(checkData, 50);
      setTimeout(() => clearInterval(interval), 1000);
    });
  }

  verifyResponse(expected, testName) {
    if (this.receivedData.length === 0) {
      console.log("✗ Aucune donnée reçue (timeout)");
      this.testResults.push({ test: testName, success: false, reason: "Timeout" });
      return false;
    }

    const received = Buffer.concat(this.receivedData.map((item) => item.data));
    const expectedHex = expected.toString("hex").toUpperCase();
    const receivedHex = received.toString("hex").toUpperCase();

    console.log(`   Envoyé:  ${expectedHex.match(/.{1,2}/g).join(" ")}`);
    console.log(`   Reçu:    ${receivedHex.match(/.{1,2}/g).join(" ")}`);

    if (receivedHex === expectedHex) {
      console.log("✓ Données identiques - Test réussi");
      this.testResults.push({ test: testName, success: true });
      return true;
    } else {
      console.log("✗ Données différentes - Test échoué");
      this.testResults.push({ test: testName, success: false, reason: "Données différentes" });
      return false;
    }
  }

  printTestSummary() {
    console.log("\n" + "=".repeat(50));
    console.log("RÉSUMÉ DES TESTS DE LOOPBACK");
    console.log("=".repeat(50));

    const passed = this.testResults.filter((r) => r.success).length;
    const total = this.testResults.length;

    this.testResults.forEach((result, index) => {
      const status = result.success ? "✓ RÉUSSI" : "✗ ÉCHOUÉ";
      const reason = result.reason ? ` (${result.reason})` : "";
      console.log(`${index + 1}. ${result.test}: ${status}${reason}`);
    });

    console.log("-".repeat(50));
    console.log(`Total: ${passed}/${total} tests réussis`);

    if (passed === total) {
      console.log("🎉 Tous les tests sont réussis ! Le module fonctionne correctement.");
    } else {
      console.log("⚠️  Certains tests ont échoué. Vérifiez les connexions.");
    }
  }
}

async function runLoopbackTests() {
  console.log("=== TEST DE LOOPBACK RS485 ===");
  console.log("Module configuré en loopback (A+ connecté à B-)");
  console.log("Les données envoyées doivent être reçues à l'identique\n");

  const args = process.argv.slice(2);
  const portName = args.find((arg) => arg.startsWith("--port="))?.split("=")[1] || "COM3";
  const baudRate = parseInt(args.find((arg) => arg.startsWith("--baud="))?.split("=")[1]) || 9600;

  await RS485Tester.listPorts();

  const tester = new RS485LoopbackTester(portName, {
    baudRate: baudRate,
    dataBits: 8,
    stopBits: 1,
    parity: "none"
  });

  try {
    console.log(`\n=== Connexion sur ${portName} à ${baudRate} baud ===`);
    await tester.connect();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Test 1: Données hexadécimales simples
    await tester.sendAndVerify("AA BB CC DD", "Test 1 - Données hex simples");
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Test 2: Séquence de bytes
    await tester.sendAndVerify("01 02 03 04 05", "Test 2 - Séquence numérique");
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Test 3: Texte ASCII
    const textBuffer = Buffer.from("Hello RS485!", "utf8");
    await tester.sendAndVerify(textBuffer, "Test 3 - Texte ASCII");
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Test 4: Trame Modbus
    await tester.sendAndVerify("01 03 00 00 00 01 84 0A", "Test 4 - Trame Modbus");
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Test 5: Données longues
    const longData = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0")).join(" ");
    await tester.sendAndVerify(longData, "Test 5 - Données longues (32 bytes)");
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Test 6: Caractères spéciaux
    await tester.sendAndVerify("00 FF 7F 80 A5 5A", "Test 6 - Caractères spéciaux");
    await new Promise((resolve) => setTimeout(resolve, 200));

    tester.printTestSummary();
  } catch (error) {
    console.error("✗ Erreur pendant les tests:", error.message);
  } finally {
    await tester.disconnect();
  }
}

if (require.main === module) {
  console.log("Usage:");
  console.log("  node loopback-test.js --port=COM3 --baud=9600");
  console.log("  node loopback-test.js --port=COM1 --baud=115200");
  console.log("");
  console.log("IMPORTANT: Connecter A+ sur B- pour le test de loopback");
  console.log("");

  runLoopbackTests().catch(console.error);
}

module.exports = RS485LoopbackTester;
