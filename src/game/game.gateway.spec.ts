import { Test, TestingModule } from '@nestjs/testing';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { faker } from '@faker-js/faker';
import { Namespace, Socket } from 'socket.io';

jest.mock('socket.io');
jest.mock('./game.gateway');
jest.mock('./game.service');

describe('GameGateway', () => {
  let gateway: GameGateway;
  let service: GameService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GameService, GameGateway],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);
    service = module.get<GameService>(GameService);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should create game if gameId is not present', async () => {
    const playerId = faker.lorem.slug();

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await gateway.handleConnection({ id: playerId, conn: { remoteAddress: '' }, handshake: { query: {} } });
  });
});
