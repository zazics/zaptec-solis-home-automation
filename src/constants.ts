import _ from 'lodash';

/**
 * All Application Constants for Zaptec-Solis Home Automation
 */
export class Constants {
  /**
   * Global Simulation Configuration
   */
  public static SIMULATION = {
    get ENABLED(): boolean {
      return process.env.SIMULATE_DATA === 'true';
    }
  };
  /**
   * Solis Inverter Configuration
   */
  public static SOLIS = {
    get PORT(): string {
      return process.env.SOLIS_PORT || 'COM2';
    },

    get BAUD_RATE(): number {
      return _.toNumber(process.env.SOLIS_BAUD_RATE) || 9600;
    },

    get DATA_BITS(): 8 | 7 | 6 | 5 {
      return (_.toNumber(process.env.SOLIS_DATA_BITS) as 8 | 7 | 6 | 5) || 8;
    },

    get STOP_BITS(): 1 | 2 {
      return (_.toNumber(process.env.SOLIS_STOP_BITS) as 1 | 2) || 1;
    },

    get PARITY(): 'none' | 'even' | 'mark' | 'odd' | 'space' {
      return (process.env.SOLIS_PARITY as 'none' | 'even' | 'mark' | 'odd' | 'space') || 'none';
    },

    get SLAVE_ID(): number {
      return _.toNumber(process.env.SOLIS_SLAVE_ID) || 1;
    },

    get RESPONSE_TIMEOUT(): number {
      return _.toNumber(process.env.SOLIS_RESPONSE_TIMEOUT) || 2000;
    },

    get RETRY_COUNT(): number {
      return _.toNumber(process.env.SOLIS_RETRY_COUNT) || 3;
    },

    get RETRY_DELAY(): number {
      return _.toNumber(process.env.SOLIS_RETRY_DELAY) || 500;
    },

    get SIMULATE_DATA(): boolean {
      return Constants.SIMULATION.ENABLED;
    }
  };

  /**
   * Zaptec Charger Configuration
   */
  public static ZAPTEC = {
    get USERNAME(): string {
      return process.env.ZAPTEC_USERNAME || '';
    },

    get PASSWORD(): string {
      return process.env.ZAPTEC_PASSWORD || '';
    },

    get CHARGER_ID(): string {
      return process.env.ZAPTEC_CHARGER_ID || '';
    },

    get API_BASE_URL(): string {
      return process.env.ZAPTEC_API_BASE_URL || 'https://api.zaptec.com';
    },

    get CLIENT_ID(): string {
      return process.env.ZAPTEC_CLIENT_ID || 'Zaptec App';
    },

    get SIMULATE_DATA(): boolean {
      return Constants.SIMULATION.ENABLED;
    }
  };

  /**
   * Automation Configuration
   */
  public static AUTOMATION = {
    get ENABLED(): boolean {
      return process.env.AUTOMATION_ENABLED === 'true';
    },

    get MODE(): 'surplus' | 'manual' | 'minimum' | 'force_minimum' {
      return (process.env.AUTOMATION_MODE as 'surplus' | 'manual' | 'minimum' | 'force_minimum') || 'surplus';
    },


    get MAX_CHARGING_POWER(): number {
      return _.toNumber(process.env.MAX_CHARGING_POWER) || 7360;
    },


    get PRIORITY_LOAD_RESERVE(): number {
      return _.toNumber(process.env.PRIORITY_LOAD_RESERVE);
    },

    get HIGH_CONSUMPTION_REDUCTION_PERCENT(): number {
      return _.toNumber(process.env.HIGH_CONSUMPTION_REDUCTION_PERCENT) || 2;
    }
  };

  /**
   * Logging Configuration
   */
  public static LOGGING = {
    get LOG_DIR(): string {
      return process.env.LOG_DIR || 'logs';
    },

    get APP_NAME(): string {
      return process.env.APP_NAME || 'zaptec-solis-automation';
    },

    get LOG_LEVEL(): string {
      return process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    }
  };

  /**
   * Database Configuration
   */
  public static DATABASE = {
    get MONGODB_URI(): string {
      return process.env.MONGODB_URI || 'mongodb://localhost:27017/zaptec-solis';
    }
  };

  /**
   * Server Configuration
   */
  public static SERVER = {
    get PORT(): number {
      return _.toNumber(process.env.PORT) || 3000;
    },

    get NODE_ENV(): string {
      return process.env.NODE_ENV || 'development';
    }
  };

  /**
   * API Security Configuration
   */
  public static API = {
    get KEY(): string {
      return process.env.API_KEY || '';
    }
  };


  /**
   * Solar Panel Configuration
   */
  public static SOLAR_PANEL = {
    get CAPACITY_W(): number {
      return _.toNumber(process.env.SOLAR_PANEL_CAPACITY_W) || 9000; // 9kW default (18 × 500W panels)
    },

    get EFFICIENCY(): number {
      return _.toNumber(process.env.SOLAR_PANEL_EFFICIENCY) || 0.20; // 20% efficiency default
    },

    get TEMPERATURE_COEFFICIENT(): number {
      return _.toNumber(process.env.SOLAR_TEMPERATURE_COEFFICIENT) || -0.004; // -0.4%/°C default
    },

    get SYSTEM_LOSSES(): number {
      return _.toNumber(process.env.SOLAR_SYSTEM_LOSSES) || 0.12; // 12% system losses default
    }
  };

  /**
   * Power System Constants
   */
  public static POWER = {
    /**
     * Maximum inverter power capacity in watts (Solis S5-EH1P5K-L)
     */
    get INVERTER_MAX_POWER(): number {
      return 5000;
    }
  };

  /**
   * Location Constants for Belgium
   */
  public static LOCATION = {
    /**
     * Belgium coordinates (Brussels area)
     */
    get LATITUDE(): number {
      return _.toNumber(process.env.LATITUDE) || 50.85; // Brussels default
    },

    get LONGITUDE(): number {
      return _.toNumber(process.env.LONGITUDE) || 4.35; // Brussels default
    }
  };


  /**
   * Tapo Smart Plugs Configuration
   */
  public static TAPO = {
    get USERNAME(): string {
      return process.env.TAPO_USERNAME || '';
    },

    get PASSWORD(): string {
      return process.env.TAPO_PASSWORD || '';
    },

    get DEVICES(): string {
      return process.env.TAPO_DEVICES || '';
    },

    get UPDATE_INTERVAL(): number {
      return _.toNumber(process.env.TAPO_UPDATE_INTERVAL) || 30000; // 30 seconds
    },

    get CONNECTION_TIMEOUT(): number {
      return _.toNumber(process.env.TAPO_CONNECTION_TIMEOUT) || 10000; // 10 seconds
    },

    get AUTOMATION_ENABLED(): boolean {
      return process.env.TAPO_AUTOMATION_ENABLED === 'true';
    },

    get ENABLED(): boolean {
      return process.env.TAPO_ENABLED !== 'false';
    }
  };
}
