import { BaseRepository } from './base.repository.js';
import { getModels } from '../database.module.js';

/**
 * EmployeeRepository
 */
export class EmployeeRepository extends BaseRepository {
  constructor() {
    super(getModels().Employee);
  }

  async findByEmail(email) {
    return this.findOne({ email });
  }

  async findByExternalId(externalId) {
    return this.findOne({ externalId });
  }
}

/**
 * LocationRepository
 */
export class LocationRepository extends BaseRepository {
  constructor() {
    super(getModels().Location);
  }

  async findByCode(code) {
    return this.findOne({ code });
  }

  async findByExternalId(externalId) {
    return this.findOne({ externalId });
  }
}

/**
 * LeaveTypeRepository
 */
export class LeaveTypeRepository extends BaseRepository {
  constructor() {
    super(getModels().LeaveType);
  }

  async findByCode(code) {
    return this.findOne({ code });
  }

  async findByExternalId(externalId) {
    return this.findOne({ externalId });
  }
}
