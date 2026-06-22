import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BalanceRepository } from '../../infrastructure/database/repositories/balance.repository.js';
import { GetBalancesQuery, GetBalanceByIdQuery } from '../../application/queries/index.js';
import { SyncBalancesFromHcmHandler } from '../../application/commands/sync-balances-from-hcm.handler.js';
import { CurrentUser } from '../../common/decorators/jwt-auth.js';
import { USER_ROLE } from '../../common/constants.js';
import { Logger } from '../../common/logger.js';
import { validateSyncBalances } from '../../application/dtos/index.js';

const logger = new Logger('BalanceController');

export class BalanceController {
  constructor() {
    this.balanceRepo = null;
  }

  getBalanceRepository() {
    this.balanceRepo ??= new BalanceRepository();
    return this.balanceRepo;
  }

  async getAll(query, user) {
    logger.debug('GET /api/balances', { userId: user.userId });

    const getQuery = new GetBalancesQuery();
    const filters = {};

    // Employees can only see their own balances
    if (user.role === USER_ROLE.EMPLOYEE) {
      filters.employeeId = user.userId;
    }

    return await getQuery.execute(this.getBalanceRepository(), filters);
  }

  async getById(id, user) {
    logger.debug('GET /api/balances/:id', { balanceId: id, userId: user.userId });

    const getQuery = new GetBalanceByIdQuery();
    const balance = await getQuery.execute(this.getBalanceRepository(), id);

    // Check authorization
    if (user.role === USER_ROLE.EMPLOYEE && balance.employeeId !== user.userId) {
      throw { code: 'FORBIDDEN', message: 'Cannot view other employee balances' };
    }

    return balance;
  }

  async sync(dto, user) {
    logger.debug('POST /api/balances/sync', { userId: user.userId });

    if (user.role !== USER_ROLE.ADMIN) {
      throw { code: 'FORBIDDEN', message: 'Only admins can trigger sync' };
    }

    const validated = validateSyncBalances(dto);
    const handler = new SyncBalancesFromHcmHandler();
    return await handler.execute(validated);
  }
}

Controller('api/balances')(BalanceController);
ApiTags('Balances')(BalanceController);
ApiBearerAuth()(BalanceController);

const balanceGetAll = Object.getOwnPropertyDescriptor(BalanceController.prototype, 'getAll');
Get()(BalanceController.prototype, 'getAll', balanceGetAll);
ApiOperation({ summary: 'Get all balances' })(BalanceController.prototype, 'getAll', balanceGetAll);
Query()(BalanceController.prototype, 'getAll', 0);
CurrentUser()(BalanceController.prototype, 'getAll', 1);

const balanceGetById = Object.getOwnPropertyDescriptor(BalanceController.prototype, 'getById');
Get(':id')(BalanceController.prototype, 'getById', balanceGetById);
ApiOperation({ summary: 'Get a specific balance' })(BalanceController.prototype, 'getById', balanceGetById);
Param('id')(BalanceController.prototype, 'getById', 0);
CurrentUser()(BalanceController.prototype, 'getById', 1);

const balanceSync = Object.getOwnPropertyDescriptor(BalanceController.prototype, 'sync');
Post('sync')(BalanceController.prototype, 'sync', balanceSync);
HttpCode(HttpStatus.ACCEPTED)(BalanceController.prototype, 'sync', balanceSync);
ApiOperation({ summary: 'Sync balances from HCM (Admin only)' })(BalanceController.prototype, 'sync', balanceSync);
Body()(BalanceController.prototype, 'sync', 0);
CurrentUser()(BalanceController.prototype, 'sync', 1);
