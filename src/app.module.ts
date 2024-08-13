import { Module } from '@nestjs/common';
import { NasaController } from './nasa/nasa.controller';
import { NasaService } from './nasa/nasa.service';

@Module({
  imports: [],
  controllers: [NasaController],
  providers: [NasaService],
})
export class AppModule {}
