import { Logger } from '../../../common/logger.js';

/**
 * Base repository class with common CRUD operations
 */
export class BaseRepository {
  constructor(model) {
    this.model = model;
    this.logger = new Logger(this.constructor.name);
  }

  async create(data, options = {}) {
    try {
      return await this.model.create(data, options);
    } catch (error) {
      this.logger.error('Create failed', error);
      throw error;
    }
  }

  async findById(id, options = {}) {
    try {
      return await this.model.findByPk(id, options);
    } catch (error) {
      this.logger.error(`FindById failed for ${id}`, error);
      throw error;
    }
  }

  async findOne(where, options = {}) {
    try {
      return await this.model.findOne({ ...options, where });
    } catch (error) {
      this.logger.error('FindOne failed', error);
      throw error;
    }
  }

  async findAll(where = {}, options = {}) {
    try {
      return await this.model.findAll({
        ...options,
        where,
      });
    } catch (error) {
      this.logger.error('FindAll failed', error);
      throw error;
    }
  }

  async update(id, data, options = {}) {
    try {
      const instance = await this.model.findByPk(id, options);
      if (!instance) {
        return null;
      }
      return await instance.update(data, options);
    } catch (error) {
      this.logger.error(`Update failed for ${id}`, error);
      throw error;
    }
  }

  async delete(id, options = {}) {
    try {
      const instance = await this.model.findByPk(id, options);
      if (!instance) {
        return false;
      }
      await instance.destroy(options);
      return true;
    } catch (error) {
      this.logger.error(`Delete failed for ${id}`, error);
      throw error;
    }
  }

  async count(where = {}, options = {}) {
    try {
      return await this.model.count({ ...options, where });
    } catch (error) {
      this.logger.error('Count failed', error);
      throw error;
    }
  }
}
