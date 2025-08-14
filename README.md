# Zaptec-Solis Home Automation

NestJS application to control a Zaptec charging station based on information from a Solis inverter via RS485 communication.

## Installation

1. Install Node.js (https://nodejs.org/)
2. Clone the repository and install dependencies:
   ```bash
   git clone <repository-url>
   cd zaptec-solis-home-automation
   npm install
   ```
3. Copy the environment file and configure it:
   ```bash
   cp .env.example .env
   # Edit .env with your specific configuration
   ```

## Hardware Configuration

- **Inverter**: Solis S5-EH1P5K-L with RS485 COM2 port
- **RS485 Module**: Waveshare USB to RS485 module
- **Controller**: Raspberry Pi 4
- **Connections**:
  - Waveshare module USB connected to Raspberry Pi (appears as `/dev/ttyACM0`)
  - Waveshare module RS485 terminals connected to Solis inverter COM2 port (4 pin connector, use PIN 3 & 4)
- **Communication**: Modbus RTU protocol for reading inverter data

## Configuration

### Environment Variables

Configure the following variables in your `.env` file:

#### Solis Inverter Settings

- `SOLIS_PORT=/dev/ttyACM0` - USB port where Waveshare module is connected on Raspberry Pi
- `SOLIS_BAUD_RATE=9600` - Communication speed
- `SOLIS_SLAVE_ID=1` - Modbus slave ID

#### Zaptec Settings

- `ZAPTEC_USERNAME` - Your Zaptec account username
- `ZAPTEC_PASSWORD` - Your Zaptec account password
- `ZAPTEC_CHARGER_ID` - Your charger's unique ID

#### Automation Settings

- `AUTOMATION_MODE=surplus` - Control mode (surplus/scheduled/manual)
- `MIN_SURPLUS_POWER=1500` - Minimum solar surplus to start charging (W)
- `MAX_CHARGING_POWER=7360` - Maximum charging power (W)

## Usage

### Development

```bash
# Start in development mode with hot reload
npm run start:dev

# Build the application
npm run build

# Start in production mode
npm run start:prod
```

### API Endpoints

The application provides REST API endpoints:

#### Solis Inverter Data

- `GET /solis/status` - Get inverter status
- `GET /solis/pv` - Get solar panel data
- `GET /solis/battery` - Get battery information
- `GET /solis/all` - Get all inverter data

#### Zaptec Control

- `GET /zaptec/status` - Get charging station status
- `POST /zaptec/current` - Set maximum charging current
- `POST /zaptec/charging` - Enable/disable charging

#### Home Automation

- `GET /automation/status` - Get automation system status
- `GET /automation/dashboard` - Get complete dashboard data
- `POST /automation/enable` - Enable automatic control
- `POST /automation/disable` - Disable automatic control
- `PUT /automation/config` - Update automation settings

## Features

- **Real-time Monitoring**: Continuous monitoring of Solis S5-EH1P5K-L inverter via RS485
- **Smart Charging**: Automatic Zaptec charging station control based on solar surplus
- **Multiple Modes**:
  - Surplus mode: Charge only when solar surplus available
  - Scheduled mode: Charge during specific hours with surplus
  - Manual mode: Full manual control
- **REST API**: Complete HTTP API for external integrations
- **Configurable**: Extensive configuration options via environment variables
- **Logging**: Comprehensive logging for monitoring and debugging

## Troubleshooting

### Connection Issues

- Verify the Waveshare USB to RS485 module is connected to Raspberry Pi
- Check that the module appears as `/dev/ttyACM0` using `ls /dev/tty*`
- Ensure no other applications are using `/dev/ttyACM0`
- Check USB connection and try different USB ports if needed

### Communication Problems

- Verify RS485 wiring between Waveshare module and Solis inverter COM2 port:
  - A terminal → A
  - B terminal → B
  - GND → GND
- Check Solis S5-EH1P5K-L inverter power and Modbus settings
- Confirm baud rate (9600) and communication parameters match inverter configuration
- Test RS485 communication with a multimeter if available

### Permission Errors

- Ensure the user has permissions to access serial ports:
  ```bash
  sudo usermod -a -G dialout $USER
  # Logout and login again
  ```
- Check port permissions: `ls -l /dev/ttyACM0`
