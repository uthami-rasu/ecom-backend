import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { StrictRateLimit } from '../../common/decorators/strict-rate-limit.decorator.js';
import { AddressesService } from './addresses.service.js';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';
import {
  ConfirmEmailChangeDto,
  RequestEmailChangeDto,
} from './dto/email-change.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly addresses: AddressesService,
  ) {}

  @Get()
  getProfile(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }

  @Patch()
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  /** Sends a code to the new address; the email changes only after /confirm. */
  @StrictRateLimit()
  @ApiAcceptedResponse({ description: 'OtpChallenge for the new address' })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('email-change')
  requestEmailChange(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestEmailChangeDto,
  ) {
    return this.users.requestEmailChange(user.id, dto);
  }

  @StrictRateLimit()
  @HttpCode(HttpStatus.OK)
  @Post('email-change/confirm')
  confirmEmailChange(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    return this.users.confirmEmailChange(user.id, dto.code);
  }

  @Post('avatar')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.users.updateAvatar(user.id, file);
  }

  @Get('addresses')
  listAddresses(@CurrentUser() user: AuthUser) {
    return this.addresses.list(user.id);
  }

  @Post('addresses')
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto) {
    return this.addresses.create(user.id, dto);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addresses.update(user.id, id, dto);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addresses.remove(user.id, id);
  }
}
