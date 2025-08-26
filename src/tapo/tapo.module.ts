import { Module } from '@nestjs/common';
import { TapoService } from './tapo.service';
import { LoggingService } from '../common/logging.service';

/**
 * Tapo Module for TP-Link Smart Plug Integration
 *
 * Provides complete integration with TP-Link Tapo smart plugs including
 * device management, power monitoring, and automation capabilities.
 *
 * Features:
 * - Real-time power consumption monitoring
 * - Device control and automation
 * - Bulk device operations
 * - Energy usage statistics
 */
@Module({
  providers: [TapoService, LoggingService],
  exports: [TapoService]
})
export class TapoModule {}
