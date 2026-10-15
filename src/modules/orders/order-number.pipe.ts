import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const ORDER_NUMBER = /^BSC-[0-9A-Z]{8}$/;

@Injectable()
export class OrderNumberPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const normalised = String(value).trim().toUpperCase();
    if (!ORDER_NUMBER.test(normalised))
      throw new BadRequestException('Invalid order number');
    return normalised;
  }
}
