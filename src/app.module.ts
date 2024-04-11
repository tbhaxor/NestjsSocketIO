import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: [GameModule],
})
export class AppModule {}
