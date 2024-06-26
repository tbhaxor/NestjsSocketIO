import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { io, Socket } from 'socket.io-client';
import { faker } from '@faker-js/faker';
import { GameGateway } from '../src/game/game.gateway';
import { GameService } from '../src/game/game.service';
import { ESymbol } from '../src/game/dtos/maze.dto';

describe('GameModule (e2e)', () => {
  let app: INestApplication;
  let service: GameService;
  let playerA: Socket;
  let playerB: Socket;
  let gameId: string;
  let gateway: GameGateway;

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

  beforeEach(function (done) {
    if (expect.getState().currentTestName?.match(/GameController/)) {
      return done();
    }
    playerA = io('http://localhost:3000/game');
    playerA.on('gameCreated', function (data) {
      expect(data).toBeInstanceOf(Object);
      expect(typeof data.gameId).toBe('string');
      expect(data.gameId.length).toBeGreaterThan(0);

      gameId = data.gameId;

      done();
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
        expect(gameId).toBeTruthy();

        playerA.on('gameJoined', (data) => {
          expect(data).toBeInstanceOf(Object);
          expect(data).toHaveProperty('playerId');
          expect(data.playerId).toBe(playerA.id);
        });

        playerA.on('gameTurn', (data) => {
          expect(data).toBeInstanceOf(Object);
          expect(data).toHaveProperty('playerId');
          expect(data.playerId).toBe(playerA.id);
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
      return new Promise<void>((resolve) => {
        const errorGameId = faker.lorem.slug();

        playerA.onAny(function (event: string, data: Record<string, any>) {
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
        playerA.onAny(function (event: string, data: Record<string, any>) {
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

        playerA.onAny(function (event: string, data: Record<string, any>) {
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

        await new Promise<void>((resolve) => {
          playerB.on('connect', () => resolve());
        });

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
