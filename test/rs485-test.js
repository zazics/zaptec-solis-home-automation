const { SerialPort } = require('serialport');

class RS485Tester {
    constructor(portName, options = {}) {
        this.portName = portName;
        this.options = {
            baudRate: options.baudRate || 9600,
            dataBits: options.dataBits || 8,
            stopBits: options.stopBits || 1,
            parity: options.parity || 'none',
            ...options
        };
        this.port = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            this.port = new SerialPort({
                path: this.portName,
                ...this.options
            });

            return new Promise((resolve, reject) => {
                this.port.on('open', () => {
                    console.log(`✓ Connecté au port ${this.portName}`);
                    this.isConnected = true;
                    resolve();
                });

                this.port.on('error', (err) => {
                    console.error('✗ Erreur de connexion:', err.message);
                    reject(err);
                });

                this.port.on('data', (data) => {
                    console.log('← Données reçues:', data.toString('hex').toUpperCase().match(/.{1,2}/g).join(' '));
                    console.log('← ASCII:', data.toString().replace(/[^\x20-\x7E]/g, '.'));
                });
            });
        } catch (error) {
            console.error('✗ Erreur lors de l\'ouverture du port:', error.message);
            throw error;
        }
    }

    async disconnect() {
        if (this.port && this.port.isOpen) {
            return new Promise((resolve) => {
                this.port.close(() => {
                    console.log('✓ Port fermé');
                    this.isConnected = false;
                    resolve();
                });
            });
        }
    }

    async sendData(data) {
        if (!this.isConnected || !this.port || !this.port.isOpen) {
            throw new Error('Port non connecté');
        }

        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'hex');
        
        return new Promise((resolve, reject) => {
            console.log('→ Envoi:', buffer.toString('hex').toUpperCase().match(/.{1,2}/g).join(' '));
            
            this.port.write(buffer, (err) => {
                if (err) {
                    console.error('✗ Erreur d\'envoi:', err.message);
                    reject(err);
                } else {
                    console.log('✓ Données envoyées');
                    resolve();
                }
            });
        });
    }

    async sendText(text) {
        const buffer = Buffer.from(text, 'utf8');
        await this.sendData(buffer);
    }

    static async listPorts() {
        try {
            const ports = await SerialPort.list();
            console.log('\n=== Ports série disponibles ===');
            ports.forEach((port, index) => {
                console.log(`${index + 1}. ${port.path}`);
                if (port.manufacturer) console.log(`   Fabricant: ${port.manufacturer}`);
                if (port.productId) console.log(`   Product ID: ${port.productId}`);
                if (port.vendorId) console.log(`   Vendor ID: ${port.vendorId}`);
                console.log('');
            });
            return ports;
        } catch (error) {
            console.error('✗ Erreur lors de la liste des ports:', error.message);
            throw error;
        }
    }
}

async function runTests() {
    console.log('=== Test du module Waveshare USB to RS485 ===\n');

    const args = process.argv.slice(2);
    const portName = args.find(arg => arg.startsWith('--port='))?.split('=')[1] || 'COM3';
    const baudRate = parseInt(args.find(arg => arg.startsWith('--baud='))?.split('=')[1]) || 9600;

    await RS485Tester.listPorts();

    const tester = new RS485Tester(portName, {
        baudRate: baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
    });

    try {
        console.log(`\n=== Test de connexion sur ${portName} à ${baudRate} baud ===`);
        await tester.connect();

        console.log('\n=== Test d\'envoi de données hexadécimales ===');
        await tester.sendData('01 03 00 00 00 01 84 0A');
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('\n=== Test d\'envoi de texte ===');
        await tester.sendText('Hello RS485!');
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('\n=== Test d\'envoi de commande Modbus RTU ===');
        await tester.sendData('01 04 00 00 00 02 71 CB');
        await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
        console.error('✗ Erreur pendant les tests:', error.message);
    } finally {
        await tester.disconnect();
    }
}

if (require.main === module) {
    console.log('Usage:');
    console.log('  node rs485-test.js --port=COM3 --baud=9600');
    console.log('  node rs485-test.js --port=COM1 --baud=115200');
    console.log('');
    
    runTests().catch(console.error);
}

module.exports = RS485Tester;