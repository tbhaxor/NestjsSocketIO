import { Test, TestingModule } from '@nestjs/testing';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { faker } from '@faker-js/faker';
import { NotFoundException } from '@nestjs/common';
import { GameDto } from './dtos/game.dto';

describe('GameController', () => {
  let controller: GameController;
  let service: GameService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GameController],
      providers: [GameService],
    }).compile();

    controller = module.get<GameController>(GameController);
    service = module.get<GameService>(GameService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return all the games', () => {
    expect(controller.getAllGames()).toHaveLength(0);
    service.createGame(faker.lorem.slug());
    expect(controller.getAllGames()).toHaveLength(1);
  });

  it("should throw NotFoundException when gameId doesn't exist", () => {
    expect(() => controller.getGame(faker.lorem.slug())).toThrow(NotFoundException);
  });

  it('should return GameDto for the valid gameId', () => {
    const gameId = service.createGame(faker.lorem.slug());
    expect(controller.getGame(gameId)).toBeInstanceOf(GameDto);
  });
});
