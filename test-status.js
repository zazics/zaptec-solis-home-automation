#!/usr/bin/env node

/**
 * Quick test script to identify correct Solis status registers
 * Run with: node test-status.js
 */

const { SerialPort } = require('serialport');

// Solis configuration (adjust as needed)
const CONFIG = {
  port: '/dev/ttyACM0', // Change to your actual port (or /dev/ttyACM0 on Raspberry Pi)
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  slaveId: 1,
  timeout: 2000,
};

// Test these register addresses for status
const TEST_REGISTERS = [
  33015, // Device status
  33034, // Alternative status
  33035, // Alternative status
  33041, // Standard inverter status
  33095, // Current configured status
  33100, // Alternative status
  33200, // High address test
];

/**
 * Create Modbus RTU read frame
 */
function createReadFrame(slaveId, startAddr, quantity) {
  const buffer = Buffer.alloc(8);
  buffer[0] = slaveId;
  buffer[1] = 0x04; // Read Input Registers
  buffer.writeUInt16BE(startAddr, 2);
  buffer.writeUInt16BE(quantity, 4);

  // Calculate CRC16
  const crc = calculateCRC16(buffer.slice(0, 6));
  buffer.writeUInt16LE(crc, 6);

  return buffer;
}

/**
 * Calculate CRC16 for Modbus
 */
function calculateCRC16(buffer) {
  let crc = 0xffff;

  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc >>= 1;
      }
    }
  }

  return crc;
}

/**
 * Test a single register
 */
async function testRegister(port, address) {
  return new Promise((resolve) => {
    const frame = createReadFrame(CONFIG.slaveId, address, 1);
    let responseData = Buffer.alloc(0);
    let timeout;

    const onData = (data) => {
      responseData = Buffer.concat([responseData, data]);

      // Clear previous timeout and set new one
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        port.removeListener('data', onData);

        if (responseData.length >= 5) {
          // Parse response: [slaveId][function][byteCount][data...][crc]
          const value = responseData.readUInt16BE(3);
          resolve({
            success: true,
            value: value,
            hex: '0x' + value.toString(16).toUpperCase().padStart(4, '0'),
            binary: '0b' + value.toString(2).padStart(16, '0'),
            raw: responseData,
          });
        } else {
          resolve({ success: false, error: 'Invalid response length' });
        }
      }, 200);
    };

    port.on('data', onData);

    // Overall timeout
    timeout = setTimeout(() => {
      port.removeListener('data', onData);
      resolve({ success: false, error: 'Timeout' });
    }, CONFIG.timeout);

    port.write(frame, (err) => {
      if (err) {
        clearTimeout(timeout);
        port.removeListener('data', onData);
        resolve({ success: false, error: err.message });
      }
    });
  });
}

/**
 * Interpret common status values
 */
function interpretStatus(value) {
  const interpretations = [];

  // Common Solis status codes
  const statusCodes = {
    0x0000: 'Standby/Waiting',
    0x0001: 'Normal Operation',
    0x0002: 'Normal Operation',
    0x0003: 'Alarm',
    0x0004: 'Fault',
    0x0100: 'Grid Connected',
    0x0200: 'Generating Power',
    0x0400: 'System OK',
  };

  if (statusCodes[value]) {
    interpretations.push(statusCodes[value]);
  }

  // Bit-field interpretation
  if (value & 0x01) interpretations.push('Bit 0: Active');
  if (value & 0x02) interpretations.push('Bit 1: Normal');
  if (value & 0x04) interpretations.push('Bit 2: Warning');
  if (value & 0x08) interpretations.push('Bit 3: Fault');

  return interpretations.length > 0 ? interpretations.join(', ') : 'Unknown status';
}

/**
 * Main test function
 */
async function main() {
  console.log('🔍 Solis Status Register Tester');
  console.log('================================');
  console.log(`Port: ${CONFIG.port}`);
  console.log(`Slave ID: ${CONFIG.slaveId}`);
  console.log('');

  let port;

  try {
    port = new SerialPort({
      path: CONFIG.port,
      baudRate: CONFIG.baudRate,
      dataBits: CONFIG.dataBits,
      stopBits: CONFIG.stopBits,
      parity: CONFIG.parity,
    });

    await new Promise((resolve, reject) => {
      port.on('open', resolve);
      port.on('error', reject);
    });

    console.log('✅ Serial port opened successfully');
    console.log('');

    // Test each register
    for (const address of TEST_REGISTERS) {
      console.log(`Testing register ${address}:`);

      const result = await testRegister(port, address);

      if (result.success) {
        console.log(`  ✅ Value: ${result.value} (${result.hex}) (${result.binary})`);
        console.log(`  📖 Interpretation: ${interpretStatus(result.value)}`);
      } else {
        console.log(`  ❌ Error: ${result.error}`);
      }

      console.log('');

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    console.log('🏁 Test completed!');
    console.log('');
    console.log('📝 Analysis:');
    console.log('  - Look for registers returning valid values (not 0 or errors)');
    console.log('  - Compare values with expected inverter state');
    console.log('  - Non-zero values likely indicate the correct status register');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('💡 Troubleshooting:');
    console.log('  - Check if the correct serial port is specified');
    console.log('  - Ensure no other applications are using the port');
    console.log('  - Verify RS485 connections to the Solis inverter');
    console.log('  - Check if the inverter is powered on');
  } finally {
    if (port && port.isOpen) {
      port.close();
    }
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testRegister, interpretStatus };
