import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

export class HealthController {
  health() {
    return {
      status: 'up',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}

Controller('health')(HealthController);

const healthDescriptor = Object.getOwnPropertyDescriptor(HealthController.prototype, 'health');
Get()(HealthController.prototype, 'health', healthDescriptor);
HttpCode(HttpStatus.OK)(HealthController.prototype, 'health', healthDescriptor);
