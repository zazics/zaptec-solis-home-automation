# Zaptec-Solis Home Automation

A comprehensive NestJS application that intelligently controls Zaptec EV charging stations based on real-time solar energy production data from Solis inverters. The system optimizes charging to maximize the use of surplus solar energy while maintaining grid stability and respecting user preferences.

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

4. For development/testing without hardware:
   ```bash
   # Enable simulation mode in .env
   echo "SOLIS_SIMULATE_DATA=true" >> .env
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
- `SOLIS_BAUD_RATE=9600` - Communication speed (default: 9600)
- `SOLIS_DATA_BITS=8` - Data bits (default: 8)
- `SOLIS_STOP_BITS=1` - Stop bits (default: 1)
- `SOLIS_PARITY=none` - Parity setting (default: none)
- `SOLIS_SLAVE_ID=1` - Modbus slave ID (default: 1)
- `SOLIS_RESPONSE_TIMEOUT=2000` - Response timeout in ms (default: 2000)
- `SOLIS_RETRY_COUNT=3` - Number of retries for failed communications (default: 3)
- `SOLIS_RETRY_DELAY=500` - Delay between retries in ms (default: 500)
- `SOLIS_SIMULATE_DATA=false` - Enable simulation mode for testing (default: false)

#### Zaptec Settings

- `ZAPTEC_USERNAME` - Your Zaptec account username
- `ZAPTEC_PASSWORD` - Your Zaptec account password
- `ZAPTEC_CHARGER_ID` - Your charger's unique ID
- `ZAPTEC_API_BASE_URL=https://api.zaptec.com` - Zaptec API base URL (default: https://api.zaptec.com)
- `ZAPTEC_CLIENT_ID=Zaptec App` - OAuth client ID (default: Zaptec App)

#### Automation Settings

- `AUTOMATION_ENABLED=true` - Enable/disable automation (default: true)
- `AUTOMATION_MODE=surplus` - Control mode: surplus/manual (default: surplus)
- `MAX_CHARGING_POWER=7360` - Maximum charging power in W (default: 7360)
- `PRIORITY_LOAD_RESERVE=500` - Power reserve for priority loads in W (default: 500)
- `MONGODB_SAVE_FREQUENCY=3` - Save data to MongoDB every N cycles (default: 3)

#### Database Settings

- `MONGODB_URI=mongodb://localhost:27017/zaptec-solis` - MongoDB connection string

#### Server Settings

- `PORT=3000` - HTTP server port (default: 3000)
- `NODE_ENV=development` - Node environment (development/production)

#### Logging Settings

- `LOG_DIR=logs` - Directory for log files (default: logs)
- `APP_NAME=zaptec-solis-automation` - Application name for logs
- `LOG_LEVEL=INFO` - Logging level: DEBUG/INFO/WARN/ERROR (default: INFO)

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

The application provides comprehensive REST API endpoints:

#### Solis Inverter Data

- `GET /solis/status` - Get inverter connection and operational status
- `GET /solis/pv` - Get solar panel production data (voltage, current, power)
- `GET /solis/battery` - Get battery information (SOC, power, voltage)
- `GET /solis/grid` - Get grid interaction data (import/export power)
- `GET /solis/house` - Get household consumption data
- `GET /solis/ac` - Get AC output data (frequency, temperature)
- `GET /solis/all` - Get complete inverter data in single request

#### Zaptec Control (Read-Only)

- `GET /zaptec/status` - Get charging station status and capabilities
- `GET /zaptec/installation` - Get installation-level information
- `GET /zaptec/history?days=7` - Get charging session history
- `GET /zaptec/test` - Test connectivity with Zaptec cloud API

Note: Remote control endpoints have been removed for security. The system now operates in monitoring mode only.

#### Home Automation

- `GET /automation/status` - Get complete automation system status
- `GET /automation/config` - Get current automation configuration
- `GET /automation/dashboard` - Get dashboard data with all metrics
- `POST /automation/enable` - Enable automatic control
- `POST /automation/disable` - Disable automatic control
- `PUT /automation/config` - Update automation configuration

Note: Manual automation trigger endpoint has been removed for security.

#### Example API Responses

**GET /automation/status**
```json
{
  "enabled": true,
  "lastUpdate": "2024-01-15T10:30:00Z",
  "solarProduction": 3500,
  "houseConsumption": 1200,
  "availableForCharging": 1800,
  "chargingStatus": {
    "active": true,
    "current": 8,
    "power": 1840
  },
  "mode": "surplus"
}
```

**GET /solis/all**
```json
{
  "status": { "code": 1, "text": "ok" },
  "timestamp": "2024-01-15T10:30:00Z",
  "pv": {
    "pv1": { "voltage": 385.2, "current": 4.2, "power": 1618 },
    "pv2": { "voltage": 382.1, "current": 4.1, "power": 1567 },
    "totalPowerDC": 3185
  },
  "ac": {
    "totalPowerAC": 3026,
    "frequency": 50.02,
    "temperature": 32.1
  },
  "house": { "consumption": 1250 },
  "grid": { "activePower": 1776, "inverterPower": 3026 },
  "battery": { "power": -450, "soc": 78, "voltage": 49.2 }
}
```

## Features

### Core Functionality
- **Real-time Monitoring**: Continuous monitoring of Solis S5-EH1P5K-L inverter via RS485/Modbus RTU
- **Smart Charging**: Intelligent Zaptec charging station control based on solar energy surplus
- **Data Logging**: Historical data storage in MongoDB with configurable frequency
- **Simulation Mode**: Built-in data simulation for testing and development

### Automation Modes
- **Surplus Mode**: Charge only when solar production exceeds household consumption with intelligent battery SOC-based tolerances
- **Manual Mode**: Complete manual control without automation

### Technical Features
- **REST API**: Comprehensive HTTP API for external integrations and monitoring
- **OAuth2 Authentication**: Secure communication with Zaptec cloud API
- **Configurable Parameters**: Extensive configuration via environment variables
- **Error Handling**: Robust error handling with automatic retries and fallbacks
- **Real-time Calculations**: Dynamic power flow analysis and charging optimization
- **Safety Limits**: Configurable power thresholds and safety reserves
- **Comprehensive Logging**: Multi-level logging with file-based persistence

### Integration Capabilities
- **Modbus RTU Communication**: Direct hardware communication with solar inverters
- **Cloud API Integration**: Seamless integration with Zaptec charging infrastructure
- **MongoDB Storage**: Scalable data storage for analytics and historical tracking
- **RESTful Architecture**: Standard HTTP endpoints for easy integration

## Development & Testing

### Simulation Mode

For development and testing without physical hardware, enable simulation mode:

```bash
# Enable simulation in .env file
SOLIS_SIMULATE_DATA=true
```

Simulation provides realistic data scenarios:
- **High Power**: 4.5kW production, 800W consumption (3.2kW surplus)
- **Medium Power**: 2.2kW production, 1.2kW consumption (600W surplus)
- **Low Power**: 800W production, 1.1kW consumption (200W deficit)
- **No Power**: 0W production, 950W consumption (800W deficit)

### Development Commands

```bash
# Development with hot reload
npm run start:dev

# Build the application
npm run build

# Production mode
npm run start:prod

# Linting (auto-fix enabled)
npm run lint

# Testing
npm test                 # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:cov        # Run tests with coverage
npm run test:e2e        # Run end-to-end tests

# Code formatting
npm run format
```

## Troubleshooting

### Connection Issues

- Verify the Waveshare USB to RS485 module is connected to Raspberry Pi
- Check that the module appears as `/dev/ttyACM0` using `ls /dev/tty*`
- Ensure no other applications are using `/dev/ttyACM0`
- Check USB connection and try different USB ports if needed
- Try simulation mode first: `SOLIS_SIMULATE_DATA=true`

### Communication Problems

- Verify RS485 wiring between Waveshare module and Solis inverter COM2 port:
  - A terminal → A
  - B terminal → B
  - GND → GND
- Check Solis S5-EH1P5K-L inverter power and Modbus settings
- Confirm baud rate (9600) and communication parameters match inverter configuration
- Test RS485 communication with a multimeter if available
- Check retry settings: `SOLIS_RETRY_COUNT` and `SOLIS_RETRY_DELAY`

### Authentication Issues

- Verify Zaptec credentials are correct
- Check API base URL configuration
- Ensure charger ID is valid and accessible with your account
- Check network connectivity to Zaptec cloud services

### Permission Errors

- Ensure the user has permissions to access serial ports:
  ```bash
  sudo usermod -a -G dialout $USER
  # Logout and login again
  ```
- Check port permissions: `ls -l /dev/ttyACM0`

### Database Issues

- Verify MongoDB is running and accessible
- Check MongoDB URI configuration
- Ensure database permissions are correct
- Adjust save frequency if needed: `MONGODB_SAVE_FREQUENCY`

## Architecture

### Module Structure

- **SolisModule**: Handles RS485/Modbus communication with the Solis inverter
- **ZaptecModule**: Manages API communication with Zaptec charging station
- **HomeAutomationModule**: Core automation logic coordinating between services
- **CommonModule**: Shared utilities including logging and configuration

### Data Flow

1. **Data Collection**: SolisService reads inverter data via RS485/Modbus RTU
2. **Power Calculation**: HomeAutomationService calculates available surplus power
3. **Decision Making**: Automation logic determines optimal charging parameters
4. **Control Execution**: ZaptecService adjusts charging station via cloud API
5. **Data Persistence**: Selected cycles save data to MongoDB for analysis

### Configuration Management

The application uses a centralized Constants class with dotenv for configuration:
- Type-safe environment variable handling with lodash conversions
- Grouped configuration by module (SOLIS, ZAPTEC, AUTOMATION, etc.)
- Default values for all parameters
- Runtime configuration validation
