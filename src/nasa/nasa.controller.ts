import { Controller, Get, Post, Body } from '@nestjs/common';
import { NasaService } from './nasa.service';

@Controller('nasa')
export class NasaController {
  constructor(private readonly nasaService: NasaService) {}

  @Post('sync')
  async syncData() {
    return await this.nasaService.  ();
  }
}