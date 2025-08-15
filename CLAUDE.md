# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS application that controls a Zaptec EV charging station based on real-time data from a Solis S5-EH1P5K-L solar inverter. The system reads inverter data via RS485/Modbus RTU communication and automatically adjusts charging based on solar surplus production.

## Development Commands

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

## Architecture

### Module Structure

- **SolisModule**: Handles RS485/Modbus communication with the Solis inverter
- **ZaptecModule**: Manages API communication with Zaptec charging station
- **HomeAutomationModule**: Core automation logic that coordinates between Solis data and Zaptec control

### Hardware Communication

- **RS485 Communication**: Uses serialport library to communicate with Solis inverter via Waveshare USB-to-RS485 module
- **Modbus RTU Protocol**: Custom implementation in `src/common/modbus-rtu.ts` for reading inverter registers
- **REST API Integration**: Communicates with Zaptec cloud API for charger control

### Configuration

Environment variables are managed through NestJS ConfigModule:

- **Solis settings**: Port, baud rate, slave ID, timeouts
- **Zaptec credentials**: Username, password, charger ID
- **Automation parameters**: Power thresholds, operating modes, schedules

### Key Features

- **Surplus Mode**: Charges only when solar production exceeds consumption
- **Scheduled Mode**: Time-based charging with surplus consideration
- **Manual Mode**: Direct charger control via API
- **Real-time Monitoring**: Continuous polling of inverter data with configurable intervals

## API Endpoints

The application provides REST endpoints organized by module:

- `/solis/*` - Inverter data and status
- `/zaptec/*` - Charging station control
- `/automation/*` - System status and configuration

## Hardware Setup Requirements

- Raspberry Pi 4 (primary target platform)
- Waveshare USB to RS485 module (appears as `/dev/ttyACM0`)
- Solis S5-EH1P5K-L inverter with COM2 port access
- RS485 wiring: Use pins 3 & 4 on inverter's 4-pin connector

## Development Notes

- TypeScript strict checks are disabled in tsconfig.json for flexibility
- ESLint configuration includes Prettier integration
- Jest is configured for unit testing with coverage support
- The application uses decorators extensively (NestJS framework requirement)

## Code Documentation Standards

- **Always add JSDoc comments** to class headers describing the class purpose
- **Always add method documentation** with parameter descriptions, return types, and purpose
- **Always add explicit return types** to all methods (e.g., `Promise<ZaptecStatus>`, `Promise<{success: boolean}>`)
- **Always specify access modifiers** on all methods and constructors (`public`, `private`, `protected`)
- Use English for all comments and documentation
- Follow JSDoc format: `@param {type} name - description` and `@returns {type} description`
- Import necessary types/interfaces when used in return type annotations
