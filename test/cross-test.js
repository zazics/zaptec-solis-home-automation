const { SerialPort } = require('serialport');

class RS485CrossTester {
    constructor(rs485Port = 'COM4', ttlPort = 'COM5', options = {}) {
        this.rs485PortName = rs485Port;
        this.ttlPortName = ttlPort;
        this.options = {
            baudRate: options.baudRate || 9600,
            dataBits: options.dataBits || 8,
            stopBits: options.stopBits || 1,
            parity: options.parity || 'none',
            ...options
        };
        
        this.rs485Port = null;
        this.ttlPort = null;
        this.rs485Connected = false;
        this.ttlConnected = false;
        
        this.receivedDataRS485 = [];
        this.receivedDataTTL = [];
        this.testResults = [];
    }

    async connect() {
        console.log('=== CONNEXION AUX PORTS ===');
        
        try {
            // Connexion RS485
            this.rs485Port = new SerialPort({
                path: this.rs485PortName,
                ...this.options
            });

            // Connexion TTL
            this.ttlPort = new SerialPort({
                path: this.ttlPortName,
                ...this.options
            });

            await Promise.all([
                this.connectPort(this.rs485Port, 'RS485', this.rs485PortName),
                this.connectPort(this.ttlPort, 'TTL', this.ttlPortName)
            ]);

            // Gestion des données reçues
            this.rs485Port.on('data', (data) => {
                this.receivedDataRS485.push({
                    timestamp: Date.now(),
                    data: data
                });
                console.log(`← RS485: ${data.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || 'N/A'}`);
            });

            this.ttlPort.on('data', (data) => {
                this.receivedDataTTL.push({
                    timestamp: Date.now(),
                    data: data
                });
                console.log(`← TTL:   ${data.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || 'N/A'}`);
            });

            console.log('✓ Tous les ports connectés\n');

        } catch (error) {
            console.error('✗ Erreur de connexion:', error.message);
            throw error;
        }
    }

    async connectPort(port, name, portName) {
        return new Promise((resolve, reject) => {
            port.on('open', () => {
                console.log(`✓ ${name} connecté sur ${portName}`);
                if (name === 'RS485') this.rs485Connected = true;
                if (name === 'TTL') this.ttlConnected = true;
                resolve();
            });

            port.on('error', (err) => {
                console.error(`✗ Erreur ${name}:`, err.message);
                reject(err);
            });
        });
    }

    async disconnect() {
        const promises = [];
        
        if (this.rs485Port && this.rs485Port.isOpen) {
            promises.push(new Promise(resolve => {
                this.rs485Port.close(() => {
                    console.log('✓ Port RS485 fermé');
                    resolve();
                });
            }));
        }
        
        if (this.ttlPort && this.ttlPort.isOpen) {
            promises.push(new Promise(resolve => {
                this.ttlPort.close(() => {
                    console.log('✓ Port TTL fermé');
                    resolve();
                });
            }));
        }

        await Promise.all(promises);
    }

    async sendRS485AndReceiveTTL(data, testName) {
        console.log(`\n=== ${testName} ===`);
        console.log('Direction: RS485 → TTL');
        
        this.receivedDataTTL = [];
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'hex');
        
        console.log(`→ RS485: ${buffer.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ')}`);
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                const success = this.verifyTTLReception(buffer, testName);
                resolve(success);
            }, 2000);

            this.rs485Port.write(buffer, (err) => {
                if (err) {
                    console.error('✗ Erreur envoi RS485:', err.message);
                    clearTimeout(timeout);
                    resolve(false);
                }
            });
        });
    }

    async sendTTLAndReceiveRS485(data, testName) {
        console.log(`\n=== ${testName} ===`);
        console.log('Direction: TTL → RS485');
        
        this.receivedDataRS485 = [];
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'hex');
        
        console.log(`→ TTL:   ${buffer.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ')}`);
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                const success = this.verifyRS485Reception(buffer, testName);
                resolve(success);
            }, 2000);

            this.ttlPort.write(buffer, (err) => {
                if (err) {
                    console.error('✗ Erreur envoi TTL:', err.message);
                    clearTimeout(timeout);
                    resolve(false);
                }
            });
        });
    }

    verifyTTLReception(expected, testName) {
        if (this.receivedDataTTL.length === 0) {
            console.log('✗ Aucune donnée reçue sur TTL (timeout)');
            this.testResults.push({ test: testName, success: false, reason: 'Timeout TTL' });
            return false;
        }

        const received = Buffer.concat(this.receivedDataTTL.map(item => item.data));
        return this.compareData(expected, received, testName);
    }

    verifyRS485Reception(expected, testName) {
        if (this.receivedDataRS485.length === 0) {
            console.log('✗ Aucune donnée reçue sur RS485 (timeout)');
            this.testResults.push({ test: testName, success: false, reason: 'Timeout RS485' });
            return false;
        }

        const received = Buffer.concat(this.receivedDataRS485.map(item => item.data));
        return this.compareData(expected, received, testName);
    }

    compareData(expected, received, testName) {
        const expectedHex = expected.toString('hex').toUpperCase();
        const receivedHex = received.toString('hex').toUpperCase();

        console.log(`   Attendu: ${expectedHex.match(/.{1,2}/g)?.join(' ')}`);
        console.log(`   Reçu:    ${receivedHex.match(/.{1,2}/g)?.join(' ')}`);

        if (receivedHex.includes(expectedHex) || expectedHex.includes(receivedHex)) {
            console.log('✓ Données correspondantes - Test réussi');
            this.testResults.push({ test: testName, success: true });
            return true;
        } else {
            console.log('✗ Données différentes - Test échoué');
            this.testResults.push({ test: testName, success: false, reason: 'Données différentes' });
            return false;
        }
    }

    printTestSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('RÉSUMÉ DES TESTS CROISÉS RS485 ↔ TTL');
        console.log('='.repeat(60));
        
        const passed = this.testResults.filter(r => r.success).length;
        const total = this.testResults.length;
        
        this.testResults.forEach((result, index) => {
            const status = result.success ? '✓ RÉUSSI' : '✗ ÉCHOUÉ';
            const reason = result.reason ? ` (${result.reason})` : '';
            console.log(`${index + 1}. ${result.test}: ${status}${reason}`);
        });
        
        console.log('-'.repeat(60));
        console.log(`Total: ${passed}/${total} tests réussis`);
        
        if (passed === total) {
            console.log('🎉 Communication bidirectionnelle fonctionnelle !');
        } else if (passed > 0) {
            console.log('⚠️  Communication partielle. Vérifiez les connexions.');
        } else {
            console.log('❌ Aucune communication. Vérifiez le câblage.');
        }
        
        console.log('\nConnexions suggérées:');
        console.log('Rouge (VCC) → VCC module (si nécessaire)');
        console.log('Noir (GND)  → GND module');
        console.log('Blanc (RX)  ↔ A+ module');
        console.log('Vert (TX)   ↔ B- module');
    }
}

async function runCrossTests() {
    console.log('=== TEST CROISÉ RS485 ↔ USB-TTL ===\n');
    
    const args = process.argv.slice(2);
    const rs485Port = args.find(arg => arg.startsWith('--rs485='))?.split('=')[1] || 'COM4';
    const ttlPort = args.find(arg => arg.startsWith('--ttl='))?.split('=')[1] || 'COM5';
    const baudRate = parseInt(args.find(arg => arg.startsWith('--baud='))?.split('=')[1]) || 9600;

    const tester = new RS485CrossTester(rs485Port, ttlPort, {
        baudRate: baudRate
    });

    try {
        await tester.connect();
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test 1: RS485 vers TTL
        await tester.sendRS485AndReceiveTTL('AA BB CC', 'Test 1 - RS485 → TTL (données simples)');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Test 2: TTL vers RS485  
        await tester.sendTTLAndReceiveRS485('11 22 33', 'Test 2 - TTL → RS485 (données simples)');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Test 3: Texte ASCII
        const textBuffer = Buffer.from('Hello!', 'utf8');
        await tester.sendRS485AndReceiveTTL(textBuffer, 'Test 3 - RS485 → TTL (texte)');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Test 4: Trame plus longue
        await tester.sendTTLAndReceiveRS485('01 02 03 04 05 06 07 08', 'Test 4 - TTL → RS485 (trame longue)');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Test 5: Données Modbus
        await tester.sendRS485AndReceiveTTL('01 03 00 00 00 01 84 0A', 'Test 5 - RS485 → TTL (Modbus)');
        await new Promise(resolve => setTimeout(resolve, 500));

        tester.printTestSummary();

    } catch (error) {
        console.error('✗ Erreur pendant les tests:', error.message);
    } finally {
        await tester.disconnect();
    }
}

if (require.main === module) {
    console.log('Usage:');
    console.log('  node cross-test.js --rs485=COM4 --ttl=COM5 --baud=9600');
    console.log('  node cross-test.js --rs485=COM3 --ttl=COM6 --baud=115200');
    console.log('');
    console.log('CONNEXIONS REQUISES:');
    console.log('  Câble USB-TTL     Module RS485');
    console.log('  Rouge (VCC)   →   VCC (si nécessaire)');
    console.log('  Noir (GND)    →   GND');
    console.log('  Blanc (RX)    ↔   A+');
    console.log('  Vert (TX)     ↔   B-');
    console.log('');
    
    runCrossTests().catch(console.error);
}