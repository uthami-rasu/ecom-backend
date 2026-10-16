import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { Role } from '../../../common/enums/role.enum.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { CustomersService } from '../customers.service.js';

@ApiTags('Admin Customers')
@ApiBearerAuth()
@Roles(Role.Admin)
@UseGuards(RolesGuard)
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.customers.listCustomers({ search, status, page, limit });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.getCustomerDetail(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.customers.updateStatus(id, isActive);
  }
}
