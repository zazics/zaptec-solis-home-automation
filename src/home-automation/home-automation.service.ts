import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SolisService, SolisInverterData } from '../solis/solis.service';
import { ZaptecService, ZaptecStatus } from '../zaptec/zaptec.service';

export interface AutomationStatus {
  enabled: boolean;
  lastUpdate: Date;
  solarProduction: number; // W
  houseConsumption: number; // W
  availableForCharging: number; // W
  chargingStatus: {
    active: boolean;
    current: number; // A
    power: number; // W
  };
  mode: 'surplus' | 'scheduled' | 'manual';
}

export interface AutomationConfig {
  enabled: boolean;
  mode: 'surplus' | 'scheduled' | 'manual';
  minSurplusPower: number; // Minimum surplus power to start charging (W)
  maxChargingPower: number; // Maximum charging power (W)
  scheduledHours: string[]; // Hours when charging is allowed (24h format)
  priorityLoadReserve: number; // Power to reserve for priority loads (W)
}

@Injectable()
export class HomeAutomationService {
  private readonly logger = new Logger(HomeAutomationService.name);

  private config: AutomationConfig;
  private lastAutomationRun: Date = new Date();
  private automationEnabled: boolean = true;

  constructor(
    private readonly configService: ConfigService,
    private readonly solisService: SolisService,
    private readonly zaptecService: ZaptecService,
  ) {
    this.config = {
      enabled: this.configService.get<boolean>('AUTOMATION_ENABLED', true),
      mode: this.configService.get<'surplus' | 'scheduled' | 'manual'>('AUTOMATION_MODE', 'surplus'),
      minSurplusPower: this.configService.get<number>('MIN_SURPLUS_POWER', 1500), // 1.5kW minimum
      maxChargingPower: this.configService.get<number>('MAX_CHARGING_POWER', 7360), // 32A * 230V
      scheduledHours: this.configService.get<string>('SCHEDULED_HOURS', '10,11,12,13,14,15,16').split(','),
      priorityLoadReserve: this.configService.get<number>('PRIORITY_LOAD_RESERVE', 500), // 500W reserve
    };

    this.logger.log('Home automation service initialized with config:', this.config);
  }

  /**
   * Tâche automatique qui s'exécute toutes les minutes pour optimiser la charge
   */
  @Cron(CronExpression.EVERY_MINUTE)
  public async runAutomation(): Promise<void> {
    if (!this.config.enabled || !this.automationEnabled) {
      return;
    }

    try {
      this.logger.debug('Running automation cycle...');

      // Récupère les données de l'onduleur Solis
      const solisData = await this.solisService.getAllData();

      // Récupère le statut de la borne Zaptec
      const zaptecStatus = await this.zaptecService.getChargerStatus();

      // Calcule la puissance disponible pour la charge
      const availablePower = this.calculateAvailablePower(solisData);

      // Exécute la logique d'automatisation selon le mode
      await this.executeAutomationLogic(availablePower, solisData, zaptecStatus);

      this.lastAutomationRun = new Date();
    } catch (error) {
      this.logger.error('Automation cycle failed:', error);
    }
  }

  /**
   * Calcule la puissance disponible pour la charge basée sur les données Solis
   */
  private calculateAvailablePower(solisData: SolisInverterData): number {
    const solarProduction = solisData.pv.totalPowerDC;
    const houseConsumption = solisData.house.consumption;
    const gridPower = solisData.grid.activePower; // + = injection, - = consommation
    const batteryPower = solisData.battery.power; // + = décharge, - = charge

    // Calcule l'excédent disponible
    // Si on injecte sur le réseau (gridPower > 0), cette puissance peut être utilisée pour charger
    let availablePower = 0;

    if (gridPower > 0) {
      // On injecte sur le réseau, on peut utiliser cette puissance pour charger
      availablePower = gridPower - this.config.priorityLoadReserve;
    } else if (solarProduction > houseConsumption) {
      // Production > consommation, surplus disponible
      availablePower = solarProduction - houseConsumption - this.config.priorityLoadReserve;
    }

    // S'assurer que la valeur est positive
    return Math.max(0, availablePower);
  }

  /**
   * Exécute la logique d'automatisation selon le mode configuré
   */
  private async executeAutomationLogic(
    availablePower: number,
    solisData: SolisInverterData,
    zaptecStatus: ZaptecStatus,
  ): Promise<void> {
    switch (this.config.mode) {
      case 'surplus':
        await this.executeSurplusMode(availablePower, zaptecStatus);
        break;

      case 'scheduled':
        await this.executeScheduledMode(availablePower, zaptecStatus);
        break;

      case 'manual':
        // Mode manuel - pas d'automatisation
        this.logger.debug('Manual mode - no automatic control');
        break;
    }
  }

  /**
   * Mode surplus : charge seulement quand il y a un excédent solaire
   */
  private async executeSurplusMode(availablePower: number, zaptecStatus: ZaptecStatus): Promise<void> {
    if (availablePower >= this.config.minSurplusPower && zaptecStatus.vehicleConnected) {
      // Assez de surplus et véhicule connecté
      const chargingPower = Math.min(availablePower, this.config.maxChargingPower);
      await this.zaptecService.optimizeCharging(chargingPower);
      this.logger.log(`Surplus mode: Starting/optimizing charging with ${chargingPower}W`);
    } else if (availablePower < this.config.minSurplusPower && zaptecStatus.charging) {
      // Pas assez de surplus et en cours de charge
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Surplus mode: Stopping charging - insufficient surplus');
    } else if (!zaptecStatus.vehicleConnected && zaptecStatus.charging) {
      // Véhicule déconnecté mais charge active
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Surplus mode: Stopping charging - vehicle disconnected');
    }
  }

  /**
   * Mode programmé : charge pendant les heures définies si surplus disponible
   */
  private async executeScheduledMode(availablePower: number, zaptecStatus: ZaptecStatus): Promise<void> {
    const currentHour = new Date().getHours().toString();
    const isScheduledHour = this.config.scheduledHours.includes(currentHour);

    if (isScheduledHour && availablePower >= this.config.minSurplusPower && zaptecStatus.vehicleConnected) {
      // Heure programmée, surplus disponible et véhicule connecté
      const chargingPower = Math.min(availablePower, this.config.maxChargingPower);
      await this.zaptecService.optimizeCharging(chargingPower);
      this.logger.log(`Scheduled mode: Charging with ${chargingPower}W during scheduled hour ${currentHour}`);
    } else if (!isScheduledHour && zaptecStatus.charging) {
      // Hors créneau programmé
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Scheduled mode: Stopping charging - outside scheduled hours');
    } else if (!zaptecStatus.vehicleConnected && zaptecStatus.charging) {
      // Véhicule déconnecté
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Scheduled mode: Stopping charging - vehicle disconnected');
    }
  }

  /**
   * Récupère le statut complet de l'automatisation
   */
  public async getAutomationStatus(): Promise<AutomationStatus> {
    try {
      const solisData = await this.solisService.getAllData();
      const zaptecStatus = await this.zaptecService.getChargerStatus();
      const availablePower = this.calculateAvailablePower(solisData);

      return {
        enabled: this.config.enabled && this.automationEnabled,
        lastUpdate: this.lastAutomationRun,
        solarProduction: solisData.pv.totalPowerDC,
        houseConsumption: solisData.house.consumption,
        availableForCharging: availablePower,
        chargingStatus: {
          active: zaptecStatus.charging,
          current: zaptecStatus.current,
          power: zaptecStatus.power,
        },
        mode: this.config.mode,
      };
    } catch (error) {
      this.logger.error('Failed to get automation status:', error);
      throw error;
    }
  }

  /**
   * Met à jour la configuration de l'automatisation
   */
  public async updateConfig(newConfig: Partial<AutomationConfig>): Promise<AutomationConfig> {
    this.config = { ...this.config, ...newConfig };
    this.logger.log('Automation config updated:', this.config);
    return this.config;
  }

  /**
   * Active/désactive l'automatisation
   */
  public async setAutomationEnabled(enabled: boolean): Promise<void> {
    this.automationEnabled = enabled;
    this.logger.log(`Automation ${enabled ? 'enabled' : 'disabled'}`);

    if (!enabled) {
      // Si désactivé, arrêter la charge si elle est active
      try {
        const zaptecStatus = await this.zaptecService.getChargerStatus();
        if (zaptecStatus.charging) {
          await this.zaptecService.setChargingEnabled(false);
          this.logger.log('Stopped charging due to automation being disabled');
        }
      } catch (error) {
        this.logger.error('Failed to stop charging when disabling automation:', error);
      }
    }
  }

  /**
   * Récupère la configuration actuelle
   */
  public getConfig(): AutomationConfig {
    return { ...this.config };
  }

  /**
   * Force une exécution manuelle de l'automatisation
   */
  public async runManualAutomation(): Promise<void> {
    this.logger.log('Manual automation run requested');
    await this.runAutomation();
  }
}
