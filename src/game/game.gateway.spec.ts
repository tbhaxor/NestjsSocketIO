/* eslint-disable @typescript-eslint/ban-ts-comment */
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { faker } from '@faker-js/faker';
import { TestBed } from '@automock/jest';
import { Namespace, Socket } from 'socket.io';
import { GameDto } from './dtos/game.dto';
import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('socket.io');

function makeSocket(gameId?: string): jest.Mocked<Socket> {
  // @ts-ignore
  const socket = new Socket();
  // @ts-ignore
  socket.id = faker.lorem.slug();
  // @ts-ignore
  socket.conn = socket.conn || {};
  // @ts-ignore
  socket.conn.remoteAddress = faker.internet.ipv4() + ':' + faker.internet.port();
  // @ts-ignore
  socket.handshake = { query: { gameId } };

  // @ts-ignore
  return socket;
}
describe('GameGateway', () => {
  let gateway: Omit<GameGateway, 'io'> & { io: jest.Mocked<Namespace> };
  let socket: jest.Mocked<Socket>;
  let service: jest.Mocked<GameService>;
  let game: GameDto;

  beforeEach(() => {
    jest.clearAllMocks();

    const { unit, unitRef } = TestBed.create(GameGateway).compile();

    // @ts-ignore
    gateway = unit;
    // @ts-ignore
    gateway['io'] = new Namespace();
    // @ts-ignore
    gateway['io'].to.mockReturnThis();
    service = unitRef.get(GameService);

    socket = makeSocket();
    game = new GameDto(socket.id);

    service.getGameById.mockImplementation(() => new GameDto(socket.id));
    service.createGame.mockReturnValue(game.uid);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('GameGateway::handleConnection()', () => {
    it('should create game if gameId is not present', async () => {
      await gateway.handleConnection(socket);
      expect(service.createGame).toHaveBeenCalledWith(socket.id);
      expect(service.getGameById).toHaveBeenCalledWith(game.uid);
      expect(socket.join).toHaveBeenCalledWith(game.uid);
      expect(gateway['io'].to).toHaveBeenCalledWith(game.uid);
      expect(gateway['io'].to(game.uid).emit).toHaveBeenCalledWith('gameTurn', { playerId: game.currentPlayer });
      expect(gateway['io'].to(game.uid).emit).toHaveBeenCalledWith('gameJoined', { playerId: socket.id });
      expect(service.joinToGame).not.toHaveBeenCalled();
    });

    it('should emit exception if can not find game by id', async () => {
      const exception = new NotFoundException(`Game ${game.uid} not found`);
      service.getGameById.mockImplementation(() => {
        throw exception;
      });

      await gateway.handleConnection(socket);
      expect(service.createGame).toHaveBeenCalledWith(socket.id);
      expect(service.getGameById).toHaveBeenCalledWith(game.uid);
      expect(socket.emit).toHaveBeenCalledWith('exception', exception.getResponse());
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
      expect(service.joinToGame).not.toHaveBeenCalled();
      expect(gateway['io'].to).not.toHaveBeenCalled();
    });

    it('should join player 2 to the existing game', async () => {
      await gateway.handleConnection(socket);
      service.createGame.mockClear();

      const socket2 = makeSocket(game.uid);

      await gateway.handleConnection(socket2);
      expect(service.createGame).not.toHaveBeenCalled();
      expect(service.getGameById).toHaveBeenCalledWith(game.uid);
      expect(socket.join).toHaveBeenCalledWith(game.uid);
      expect(service.joinToGame).toHaveBeenCalledWith(game.uid, socket2.id);
      expect(gateway['io'].to).toHaveBeenCalledWith(game.uid);
      expect(gateway['io'].to(game.uid).emit).toHaveBeenCalledWith('gameTurn', { playerId: game.currentPlayer });
      expect(gateway['io'].to(game.uid).emit).toHaveBeenCalledWith('gameJoined', { playerId: socket.id });
    });
  });

  describe('GameGateway::handleGameMazeUpdate()', () => {
    it('should emit BadRequestException when game is ended', async () => {
      jest.spyOn(game, 'isEnded', 'get').mockReturnValue(true);
      expect(() => gateway.handleGameMazeUpdate({ colId: 1, gameId: game.uid, rowId: 1 }, socket)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should emit BadRequestException when another player is not added', async () => {
      expect(() => gateway.handleGameMazeUpdate({ colId: 1, gameId: game.uid, rowId: 1 }, socket)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should emit BadRequestException when player does not have its turn', async () => {
      expect(() => gateway.handleGameMazeUpdate({ colId: 1, gameId: game.uid, rowId: 1 }, makeSocket())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should emit mark maze and notify players', async () => {
      await gateway.handleConnection(socket);
      const socket2 = makeSocket(game.uid);
      game.players.push(socket2.id);
      service.getGameById.mockReturnValue(game);

      const symbol = game.currentSymbol;

      const [rowId, colId] = [faker.number.int({ min: 1, max: 3 }), faker.number.int({ min: 1, max: 3 })];
      const maze = game.maze.find((v) => v.colId === colId && v.rowId === rowId);
      const markMock = jest.spyOn(maze, 'mark');
      const switchTurnMock = jest.spyOn(game, 'switchTurn');

      await gateway.handleGameMazeUpdate({ rowId, colId, gameId: game.uid }, socket);

      expect(markMock).toHaveBeenCalledWith(symbol);
      expect(switchTurnMock).toHaveBeenCalled();
      expect(gateway['io'].to).toHaveBeenCalledWith(game.uid);
      expect(gateway['io'].to(game.uid).emit).toHaveBeenCalledWith('gameMazeMarked', { colId, rowId, symbol });
      expect(gateway['io'].to(game.uid).emit).toHaveBeenCalledWith('gameTurn', { playerId: game.currentPlayer });
      expect(gateway['io'].to(game.uid).emit).toHaveBeenCalledWith('gameStats', {
        winner: game.winner,
        isEnded: game.isEnded,
        isDraw: game.isDraw,
      });
      expect(game.currentPlayer).toBe(game.players[1]);
    });
  });
});
