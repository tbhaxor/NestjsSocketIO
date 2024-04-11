import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { io, Socket } from 'socket.io-client';
import { faker } from '@faker-js/faker';

describe('GameModule (e2e)', () => {
  let app: INestApplication;
  let playerA: Socket;
  let playerB: Socket;
  let gameId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(3000);
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
      return new Promise<void>((resolve, reject) => {
        playerA = io('http://localhost:3000/game');
        const checks = {
          isConnected: false,
          isValidGame: false,
          hasEmittedGameCreated: false,
          hasEmittedGameJoined: false,
          hasEmittedGameTurn: false,
          hasNoException: true,
        };
        playerA.on('connect', () => {
          checks.isConnected = true;
        });

        playerA.on('exception', (error) => {
          checks.hasNoException = false;
          reject(error);
        });

        playerA.on('gameJoined', (data) => {
          try {
            expect(data).toBeInstanceOf(Object);
            expect(data).toHaveProperty('playerId');
            expect(data.playerId).toBe(playerA.id);
            checks.hasEmittedGameJoined = true;
          } catch (error) {
            reject(error);
          }
        });

        playerA.on('gameTurn', (data) => {
          try {
            expect(data).toBeInstanceOf(Object);
            expect(data).toHaveProperty('playerId');
            expect(data.playerId).toBe(playerA.id);
            checks.hasEmittedGameTurn = true;
          } catch (error) {
            reject(error);
          }
        });

        playerA.on('gameCreated', (data) => {
          Promise.all([
            expect(data).toBeInstanceOf(Object),
            expect(data).toHaveProperty('gameId'),
            request(app.getHttpServer())
              .get('/games')
              .expect(200)
              .expect('Content-Type', /^application\/json/)
              .expect((response) => {
                try {
                  expect(response.body[0].uid).toBe(data.gameId);
                  expect(response.body[0].players).toHaveLength(1);
                  expect(response.body[0].maze).toHaveLength(9);
                  expect(response.body[0].currentPlayer).toBe(response.body[0].players[0]);
                  expect(response.body[0].currentPlayer).toBe(playerA.id);

                  checks.isValidGame = true;
                  checks.hasEmittedGameCreated = true;
                  gameId = data.gameId;
                } catch (error) {
                  reject(error);
                }
              }),
          ]);
        });

        const timer = setInterval(() => {
          if (Object.values(checks).every((entry) => entry)) {
            clearInterval(timer);
            resolve();
            playerA.removeAllListeners();
          }
        }, 50);
      });
    });

    it('should return exception and disconnect on invalid', () => {
      return new Promise<void>((resolve, reject) => {
        const errorGameId = faker.lorem.slug();
        playerB = io(`http://localhost:3000/game?gameId=${errorGameId}`);

        playerB.on('disconnect', (reason) => {
          playerB.removeAllListeners();
          playerB = undefined;
          expect(reason).toBe('io server disconnect');
          resolve();
        });

        playerB.on('exception', (error) => {
          expect(error).toBeInstanceOf(Object);
          expect(error.message).toBe(`Game ${errorGameId} not found`);
          expect(error.error).toBe('Not Found');
          expect(error.statusCode).toBe(404);
        });

        playerB.on('gameCreated', () => {
          reject(new Error('gameCreated event fired'));
        });

        playerB.on('gameTurn', () => {
          reject(new Error('gameTurn event fired'));
        });

        playerB.on('gameJoined', () => {
          reject(new Error('gameJoined event fired'));
        });
      });
    });

    it('should join game on valid gameId', () => {
      return new Promise<void>((resolve, reject) => {
        playerB = io(`http://localhost:3000/game?gameId=${gameId}`);

        const checks = {
          isConnected: false,
          hasEmittedGameJoined: false,
          hasEmittedGameTurn: false,
        };

        playerB.on('connect', () => {
          checks.isConnected = true;
        });

        playerB.on('disconnect', (reason) => {
          reject(new Error(`Disconnected with ${reason}`));
        });
        playerB.on('exception', (error) => {
          reject(new Error(error.message));
        });
        playerB.on('gameCreated', () => {
          reject(new Error('gameCreated event fired'));
        });

        playerB.on('gameTurn', (data) => {
          expect(data).toHaveProperty('playerId');
          expect(data.playerId).toBe(playerA.id);
          checks.hasEmittedGameTurn = true;
        });

        playerB.on('gameJoined', (data) => {
          expect(data).toHaveProperty('playerId');
          expect(data.playerId).toBe(playerB.id);
          checks.hasEmittedGameJoined = true;
        });

        const timer = setInterval(() => {
          if (Object.values(checks).every((check) => check)) {
            clearInterval(timer);
            resolve();
            playerB.removeAllListeners();
          }
        }, 50);
      });
    });
  });

  describe('Socket.io Event (gameMazeMark)', () => {
    it('should throw errors on invalid gameId', () => {
      return Promise.reject('TODO');
    });

    it('should throw errors on invalid maze grid numbers', () => {
      return Promise.reject('TODO');
    });

    it('should throw exception when player without its turn tries to mark on maze', () => {
      return Promise.reject('TODO');
    });

    it('should mark maze if symbol is Empty', () => {
      return Promise.reject('TODO');
    });

    it('should throw exception if position already marked', () => {
      return Promise.reject('TODO');
    });

    it('should set isEnded when isWinner is set', () => {
      return Promise.reject('TODO');
    });

    it('should not allow marking on maze when game is ended', () => {
      return Promise.reject('TODO');
    });
  });

  afterAll(async () => {
    playerA && playerA.connected && playerA.disconnect();
    playerB && playerB.connected && playerB.disconnect();
    await app.close();
  });
});
