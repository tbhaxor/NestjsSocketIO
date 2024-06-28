import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { io, Socket } from 'socket.io-client';
import { faker } from '@faker-js/faker';
import { GameEvents, GameGateway } from '../src/game/game.gateway';
import { GameService } from '../src/game/game.service';
import { ESymbol } from '../src/game/dtos/maze.dto';

describe('GameModule (e2e)', () => {
  let app: INestApplication;
  let service: GameService;
  let playerA: Socket;
  let playerB: Socket;
  let gameId: string;
  let gateway: GameGateway;

  const connectToSocket = (gameId?: string) => io(`http://localhost:3000/game?gameId=${gameId || ''}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    gateway = moduleFixture.get<GameGateway>(GameGateway);
    service = moduleFixture.get<GameService>(GameService);
    await app.init();
    await app.listen(3000);
  });

  beforeEach(async function () {
    const matches = [/should create game on connect without gameId/, /GameController/];
    const testName = expect.getState().currentTestName;

    if (testName && matches.some((match) => match.test(testName))) {
      return;
    }

    playerA = connectToSocket();

    await new Promise<void>((resolve) => {
      playerA.on('gameCreated', function (data) {
        gameId = data.gameId;
        resolve();
      });
    });
  });

  describe('GameController', () => {
    it('/games (GET) should return empty array on start', () => {
      return request(app.getHttpServer())
        .get('/games')
        .expect(200)
        .expect('Content-Type', /^application\/json/)
        .expect('[]');
    });

    it('/games/:gameId (GET) should return 404 on invalid id', () => {
      const gameId = faker.lorem.slug();
      return request(app.getHttpServer())
        .get('/games/' + gameId)
        .expect(404)
        .expect('Content-Type', /^application\/json/)
        .expect(`{"message":"Game ${gameId} not found","error":"Not Found","statusCode":404}`);
    });
  });

  describe('Socket.io Connection', () => {
    it('should create game on connect without gameId', () => {
      return new Promise<void>(async (resolve, reject) => {
        playerA = connectToSocket();

        await new Promise<void>((resolve, reject) => {
          let step = 0;
          playerA.onAny(async (event: GameEvents, data: Record<string, any>) => {
            try {
              switch (event) {
                case 'gameCreated':
                  expect(data).toBeInstanceOf(Object);
                  expect(data).toHaveProperty('gameId');
                  expect(data.gameId.length).toBeGreaterThan(0);
                  gameId = data.gameId;
                  step++;
                  break;
                case 'gameJoined':
                case 'gameTurn':
                  expect(data).toBeInstanceOf(Object);
                  expect(data).toHaveProperty('playerId');
                  expect(data.playerId).toBe(playerA.id);
                  step++;
                  break;
                default:
                  throw new Error(`Event ${event} is not expected.`);
              }

              if (step === 3) {
                return resolve();
              }
            } catch (e) {
              return reject(e);
            }
          });
        });

        await request(app.getHttpServer())
          .get('/games')
          .expect(200)
          .expect('Content-Type', /^application\/json/)
          .expect((response) => {
            try {
              expect(response.body[0].uid).toBe(gameId);
              expect(response.body[0].players).toHaveLength(1);
              expect(response.body[0].maze).toHaveLength(9);
              expect(response.body[0].currentPlayer).toBe(response.body[0].players[0]);
              expect(response.body[0].currentPlayer).toBe(playerA.id);
            } catch (error) {
              reject(error);
            }
          });

        resolve();
      });
    });

    it('should return exception and disconnect on invalid', () => {
      return new Promise<void>((resolve, reject) => {
        playerB = connectToSocket('0');

        playerB.on('disconnect', (reason) => {
          try {
            expect(reason).toBe('io server disconnect');
            resolve();
          } catch (e) {
            reject(e);
          }
        });
        playerB.onAny((event: string, data: Record<string, any>) => {
          try {
            expect(event).toBe('exception');
            expect(data).toBeInstanceOf(Object);
            expect(data.message).toBe('Game 0 not found');
            expect(data.error).toBe('Not Found');
            expect(data.statusCode).toBe(404);
          } catch (e) {
            reject(e);
          }
        });
      });
    });

    it('should join game on valid gameId', () => {
      return new Promise<void>(async (resolve, reject) => {
        playerB = connectToSocket(gameId);
        playerB.on('disconnect', () => {
          reject('playerB socket disconnected');
        });

        await new Promise<void>((resolve) => {
          let step = 0;
          playerB.onAny((event: GameEvents, data: Record<string, any>) => {
            try {
              switch (event) {
                case 'gameJoined':
                case 'gameTurn':
                  expect(data).toBeInstanceOf(Object);
                  expect(data).toHaveProperty('playerId');
                  expect(data.playerId).toBe(event === 'gameJoined' ? playerB.id : playerA.id);
                  step++;
                  break;
                default:
                  throw new Error(`Event ${event} is not expected.`);
              }

              if (step === 2) {
                resolve();
              }
            } catch (e) {
              reject(e);
            }
          });
        });

        resolve();
      });
    });
  });

  describe('Socket.io Event (gameMazeMark)', () => {
    it('should throw errors on invalid gameId', () => {
      return new Promise<void>((resolve) => {
        const errorGameId = faker.lorem.slug();

        playerA.onAny(function (event: GameEvents, data: Record<string, any>) {
          expect(event).toBe('exception');
          expect(data.statusCode).toBe(404);
          expect(data.message).toBe(`Game ${errorGameId} not found`);
          expect(data.error).toBe('Not Found');
          resolve();
        });

        playerA.emit('gameMazeMark', {
          gameId: errorGameId,
          colId: 1,
          rowId: 1,
        });
      });
    });

    it('should throw error when playerA tries to mark maze without playerB joins', () => {
      return new Promise<void>((resolve) => {
        playerA.onAny(function (event: GameEvents, data: Record<string, any>) {
          expect(event).toBe('exception');
          expect(data.statusCode).toBe(400);
          expect(data.message).toBeInstanceOf(Array);
          expect(data.message[0]).toBe('Please wait for your opponent to join.');
          expect(data.error).toBe('Bad Request');
          resolve();
        });

        playerA.emit('gameMazeMark', {
          gameId,
          colId: 1,
          rowId: 1,
        });
      });
    });

    it('should throw errors on invalid maze grid numbers', () => {
      return new Promise<void>((resolve) => {
        playerB = io(`http://localhost:3000/game?gameId=${gameId}`);

        playerA.onAny(function (event: GameEvents, data: Record<string, any>) {
          if (event === 'exception') {
            expect(data.statusCode).toBe(400);
            expect(data.message).toBeInstanceOf(Array);
            expect(data.message).toHaveLength(2);
            expect(data.message).toEqual(['rowId must not be greater than 3', 'colId must not be greater than 3']);
            expect(data.error).toBe('Bad Request');
            resolve();
          }
        });

        const colId = faker.number.int({ min: 4, max: 10 });
        const rowId = faker.number.int({ min: 4, max: 10 });

        playerA.emit('gameMazeMark', {
          gameId,
          colId,
          rowId,
        });
      });
    });

    it('should throw exception when player without its turn tries to mark on maze', () => {
      return new Promise<void>(async (resolve, reject) => {
        playerB = io(`http://localhost:3000/game?gameId=${gameId}`);

        playerA.onAny(function (event: string) {
          reject(`Event ${event} on playerA should not be called`);
        });

        await playerB.onAny(function (event: string, data: Record<string, any>) {
          if (event === 'exception') {
            expect(data.statusCode).toBe(400);
            expect(data.message).toBeInstanceOf(Array);
            expect(data.message[0]).toEqual('Please wait for your turn.');
            expect(data.error).toBe('Bad Request');
            resolve();
          }
        });

        playerB.emit('gameMazeMark', {
          gameId,
          colId: 1,
          rowId: 2,
        });
      });
    });

    it('should throw exception if position already marked', () => {
      return new Promise<void>(async (resolve) => {
        playerB = io(`http://localhost:3000/game?gameId=${gameId}`);

        await new Promise<void>((resolve) => {
          playerB.on('connect', () => resolve());
        });

        playerA.emit('gameMazeMark', {
          gameId,
          colId: 1,
          rowId: 1,
        });

        playerB.onAny((event: string, data: Record<string, any>) => {
          if (event === 'exception') {
            expect(service.getGameById(gameId).currentPlayer).toBe(playerB.id);
            expect(data.statusCode).toBe(400);
            expect(data.message).toBeInstanceOf(Array);
            expect(data.message[0]).toEqual('This entry is already marked. Choose another location.');
            expect(data.error).toBe('Bad Request');
            resolve();
          }
        });

        playerB.emit('gameMazeMark', {
          gameId,
          colId: 1,
          rowId: 1,
        });
      });
    });

    it('should set isEnded when isWinner is set', () => {
      return new Promise<void>(async (resolve) => {
        playerB = io(`http://localhost:3000/game?gameId=${gameId}`);

        await new Promise<void>((resolve) => {
          playerB.on('connect', () => resolve());
        });

        const game = service.getGameById(gameId);
        game.maze.find((v) => v.colId == 1 && v.rowId == 1).mark(ESymbol.Cross);
        game.maze.find((v) => v.colId == 2 && v.rowId == 1).mark(ESymbol.Cross);

        playerB.onAny((event: string, data: Record<string, any>) => {
          if (event === 'gameStats') {
            expect(data).toEqual({ winner: playerA.id, isEnded: true, isDraw: false });
            resolve();
          }
        });

        playerA.emit('gameMazeMark', {
          gameId,
          colId: 3,
          rowId: 1,
        });
      });
    });

    it('should not allow marking on maze when game is ended', () => {
      return new Promise<void>(async (resolve) => {
        playerB = io(`http://localhost:3000/game?gameId=${gameId}`);

        await new Promise<void>((resolve) => {
          playerB.on('connect', () => resolve());
        });

        const game = service.getGameById(gameId);
        game.maze.find((v) => v.colId == 1 && v.rowId == 1).mark(ESymbol.Cross);
        game.maze.find((v) => v.colId == 2 && v.rowId == 1).mark(ESymbol.Cross);

        playerA.emit('gameMazeMark', {
          gameId,
          colId: 3,
          rowId: 1,
        });

        await new Promise<void>((resolve) => {
          playerB.onAny((event: string, data: Record<string, any>) => {
            if (event === 'gameStats' && data.isEnded) {
              resolve();
            }
          });
        });

        playerA.onAny((event: string, data: Record<string, any>) => {
          expect(event).toBe('exception');
          expect(data).toBeInstanceOf(Object);
          expect(data.statusCode).toBe(400);
          expect(data.error).toBe('Bad Request');
          expect(data.message).toBeInstanceOf(Array);
          expect(data.message[0]).toBe('Game is already ended.');
          resolve();
        });

        playerA.emit('gameMazeMark', {
          gameId,
          colId: 3,
          rowId: 1,
        });
      });
    });
  });

  afterEach(function () {
    playerA?.close();
    playerB?.close();
  });

  afterAll(async function () {
    await gateway.closeAllSockets();
    await app.close();
  });
});
