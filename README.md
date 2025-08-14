# Zaptec-Solis Home Automation

Node.js program to control a Zaptec charging station based on information from a Solis inverter via RS485 communication.

## Installation

1. Install Node.js (https://nodejs.org/)
2. Install dependencies:
   ```cmd
   npm install
   ```

## Hardware Configuration

- **Inverter**: Solis S5-EH1P5K-L
- **RS485 Module**: Waveshare USB to RS485 connected to COM2
- **Controller**: Raspberry Pi 4 connected to the Waveshare module
- **Communication**: Modbus RTU protocol for reading inverter data

## Configuration

### Communication Parameters

- Port: COM2
- Baud rate: 9600
- Data bits: 8
- Stop bits: 1
- Parity: None
- Flow control: None

## Features

- Read solar production data from Solis S5-EH1P5K-L inverter via RS485
- Control Zaptec charging station based on available solar power
- Automated charging optimization for home energy management

## Troubleshooting

### Connection Issues
- Verify the Waveshare USB to RS485 module is connected to COM2
- Check Windows Device Manager to confirm the port assignment
- Ensure no other applications are using COM2

### Communication Problems
- Verify RS485 wiring (A, B, GND) between Waveshare module and Solis inverter
- Check Solis S5-EH1P5K-L inverter power and Modbus settings
- Confirm baud rate (9600) and communication parameters match inverter configuration

### Permission Errors
- Close all applications using the COM2 port
- Run as administrator if necessary