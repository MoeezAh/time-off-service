import { Controller, Post, Get, Patch, Body, Param, Query, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CreateTimeOffRequestHandler } from '../../application/commands/create-time-off-request.handler.js';
import { ApproveTimeOffRequestHandler } from '../../application/commands/approve-time-off-request.handler.js';
import { RejectTimeOffRequestHandler } from '../../application/commands/reject-time-off-request.handler.js';
import { CancelTimeOffRequestHandler } from '../../application/commands/cancel-time-off-request.handler.js';
import { GetTimeOffRequestsQuery, GetTimeOffRequestByIdQuery } from '../../application/queries/index.js';
import { TimeOffRequestRepository } from '../../infrastructure/database/repositories/time-off-request.repository.js';
import { CurrentUser } from '../../common/decorators/jwt-auth.js';
import { USER_ROLE } from '../../common/constants.js';
import { Logger } from '../../common/logger.js';
import {
  validateApproval,
  validateCreateTimeOffRequest,
  validateRejection,
} from '../../application/dtos/index.js';

const logger = new Logger('TimeOffRequestController');

export class TimeOffRequestController {
  constructor() {
    this.requestRepo = null;
  }

  getRequestRepository() {
    this.requestRepo ??= new TimeOffRequestRepository();
    return this.requestRepo;
  }

  async create(dto, idempotencyKey, user) {
    logger.debug('POST /api/time-off-requests', { userId: user.userId });
    const validated = validateCreateTimeOffRequest({
      ...dto,
      employeeId: user.userId,
      idempotencyKey: idempotencyKey || dto.idempotencyKey,
    });

    const handler = new CreateTimeOffRequestHandler();
    return await handler.execute({
      employeeId: validated.employeeId,
      locationId: validated.locationId,
      leaveTypeId: validated.leaveTypeId,
      startDate: validated.startDate,
      endDate: validated.endDate,
      days: validated.days,
      reason: validated.reason,
      idempotencyKey: validated.idempotencyKey,
    });
  }

  async getAll(query, user) {
    logger.debug('GET /api/time-off-requests', { userId: user.userId });

    const getQuery = new GetTimeOffRequestsQuery();
    const filters = {};

    // Employees can only see their own requests
    if (user.role === USER_ROLE.EMPLOYEE) {
      filters.employeeId = user.userId;
    }

    // Managers can see pending requests for their team
    if (user.role === USER_ROLE.MANAGER) {
      filters.status = 'PENDING';
    }

    return await getQuery.execute(this.getRequestRepository(), filters);
  }

  async getById(id, user) {
    logger.debug('GET /api/time-off-requests/:id', { requestId: id, userId: user.userId });

    const getQuery = new GetTimeOffRequestByIdQuery();
    const request = await getQuery.execute(this.getRequestRepository(), id);

    // Check authorization
    if (user.role === USER_ROLE.EMPLOYEE && request.employeeId !== user.userId) {
      throw { code: 'FORBIDDEN', message: 'Cannot view other employee requests' };
    }

    return request;
  }

  async approve(id, dto, user) {
    logger.debug('PATCH /api/time-off-requests/:id/approve', { requestId: id, managerId: user.userId });
    const validated = validateApproval(dto);

    if (user.role !== USER_ROLE.MANAGER && user.role !== USER_ROLE.ADMIN) {
      throw { code: 'FORBIDDEN', message: 'Only managers can approve requests' };
    }

    const handler = new ApproveTimeOffRequestHandler();
    return await handler.execute({
      requestId: id,
      approverId: user.userId,
      notes: validated.notes,
    });
  }

  async reject(id, dto, user) {
    logger.debug('PATCH /api/time-off-requests/:id/reject', { requestId: id, managerId: user.userId });
    const validated = validateRejection(dto);

    if (user.role !== USER_ROLE.MANAGER && user.role !== USER_ROLE.ADMIN) {
      throw { code: 'FORBIDDEN', message: 'Only managers can reject requests' };
    }

    const handler = new RejectTimeOffRequestHandler();
    return await handler.execute({
      requestId: id,
      rejecterId: user.userId,
      reason: validated.reason,
    });
  }

  async cancel(id, user) {
    logger.debug('PATCH /api/time-off-requests/:id/cancel', { requestId: id, userId: user.userId });

    const request = await this.getRequestRepository().findById(id);
    if (!request) {
      throw { code: 'NOT_FOUND', message: 'Request not found' };
    }

    if (user.role === USER_ROLE.EMPLOYEE && request.employeeId !== user.userId) {
      throw { code: 'FORBIDDEN', message: 'Can only cancel own requests' };
    }

    const handler = new CancelTimeOffRequestHandler();
    return await handler.execute({
      requestId: id,
      userId: user.userId,
    });
  }
}

Controller('api/time-off-requests')(TimeOffRequestController);
ApiTags('Time-Off Requests')(TimeOffRequestController);
ApiBearerAuth()(TimeOffRequestController);

const createDescriptor = Object.getOwnPropertyDescriptor(TimeOffRequestController.prototype, 'create');
Post()(TimeOffRequestController.prototype, 'create', createDescriptor);
HttpCode(HttpStatus.CREATED)(TimeOffRequestController.prototype, 'create', createDescriptor);
ApiOperation({ summary: 'Create a time-off request' })(TimeOffRequestController.prototype, 'create', createDescriptor);
ApiResponse({ status: 201, description: 'Request created successfully' })(TimeOffRequestController.prototype, 'create', createDescriptor);
Body()(TimeOffRequestController.prototype, 'create', 0);
Headers('idempotency-key')(TimeOffRequestController.prototype, 'create', 1);
CurrentUser()(TimeOffRequestController.prototype, 'create', 2);

const getAllDescriptor = Object.getOwnPropertyDescriptor(TimeOffRequestController.prototype, 'getAll');
Get()(TimeOffRequestController.prototype, 'getAll', getAllDescriptor);
ApiOperation({ summary: 'Get time-off requests' })(TimeOffRequestController.prototype, 'getAll', getAllDescriptor);
ApiResponse({ status: 200, description: 'List of requests' })(TimeOffRequestController.prototype, 'getAll', getAllDescriptor);
Query()(TimeOffRequestController.prototype, 'getAll', 0);
CurrentUser()(TimeOffRequestController.prototype, 'getAll', 1);

const getByIdDescriptor = Object.getOwnPropertyDescriptor(TimeOffRequestController.prototype, 'getById');
Get(':id')(TimeOffRequestController.prototype, 'getById', getByIdDescriptor);
ApiOperation({ summary: 'Get a specific time-off request' })(TimeOffRequestController.prototype, 'getById', getByIdDescriptor);
ApiResponse({ status: 200, description: 'Request details' })(TimeOffRequestController.prototype, 'getById', getByIdDescriptor);
Param('id')(TimeOffRequestController.prototype, 'getById', 0);
CurrentUser()(TimeOffRequestController.prototype, 'getById', 1);

const approveDescriptor = Object.getOwnPropertyDescriptor(TimeOffRequestController.prototype, 'approve');
Patch(':id/approve')(TimeOffRequestController.prototype, 'approve', approveDescriptor);
HttpCode(HttpStatus.OK)(TimeOffRequestController.prototype, 'approve', approveDescriptor);
ApiOperation({ summary: 'Approve a time-off request' })(TimeOffRequestController.prototype, 'approve', approveDescriptor);
ApiResponse({ status: 200, description: 'Request approved' })(TimeOffRequestController.prototype, 'approve', approveDescriptor);
Param('id')(TimeOffRequestController.prototype, 'approve', 0);
Body()(TimeOffRequestController.prototype, 'approve', 1);
CurrentUser()(TimeOffRequestController.prototype, 'approve', 2);

const rejectDescriptor = Object.getOwnPropertyDescriptor(TimeOffRequestController.prototype, 'reject');
Patch(':id/reject')(TimeOffRequestController.prototype, 'reject', rejectDescriptor);
HttpCode(HttpStatus.OK)(TimeOffRequestController.prototype, 'reject', rejectDescriptor);
ApiOperation({ summary: 'Reject a time-off request' })(TimeOffRequestController.prototype, 'reject', rejectDescriptor);
ApiResponse({ status: 200, description: 'Request rejected' })(TimeOffRequestController.prototype, 'reject', rejectDescriptor);
Param('id')(TimeOffRequestController.prototype, 'reject', 0);
Body()(TimeOffRequestController.prototype, 'reject', 1);
CurrentUser()(TimeOffRequestController.prototype, 'reject', 2);

const cancelDescriptor = Object.getOwnPropertyDescriptor(TimeOffRequestController.prototype, 'cancel');
Patch(':id/cancel')(TimeOffRequestController.prototype, 'cancel', cancelDescriptor);
HttpCode(HttpStatus.OK)(TimeOffRequestController.prototype, 'cancel', cancelDescriptor);
ApiOperation({ summary: 'Cancel a time-off request' })(TimeOffRequestController.prototype, 'cancel', cancelDescriptor);
ApiResponse({ status: 200, description: 'Request cancelled' })(TimeOffRequestController.prototype, 'cancel', cancelDescriptor);
Param('id')(TimeOffRequestController.prototype, 'cancel', 0);
CurrentUser()(TimeOffRequestController.prototype, 'cancel', 1);
