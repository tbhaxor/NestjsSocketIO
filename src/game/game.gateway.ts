import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { GameService } from './game.service';
import type { Namespace, Socket } from 'socket.io';
import {
  BadRequestException,
  ConsoleLogger,
  HttpException,
  InternalServerErrorException,
  UseFilters,
  ValidationPipe,
} from '@nestjs/common';
import { GameMazeDto } from './dtos/game-maze-ws.dto';
import { WsGatewayExceptionFilter } from './filters/ws-gateway-exception.filter';
import { GameDto } from './dtos/game.dto';

@WebSocketGateway({ namespace: 'game', cors: { origin: true } })
export class GameGateway implements OnGatewayConnection {
  private readonly logger = new ConsoleLogger(GameGateway.name, {
    timestamp: true,
    logLevels: process.env.NODE_ENV === 'test' && ['fatal'],
  });
  @WebSocketServer() private io: Namespace;

  constructor(private gameService: GameService) {}

  @SubscribeMessage('gameMazeMark')
  @UseFilters(WsGatewayExceptionFilter)
  async handleGameMazeUpdate(
    @MessageBody(new ValidationPipe({ transform: true })) body: GameMazeDto,
    @ConnectedSocket() socket: Socket,
  ) {
    const game = this.gameService.getGameById(body.gameId);
    if (game.isEnded) {
      throw new BadRequestException(['Game is already ended.']);
    }

    if (game.players.length < 2) {
      throw new BadRequestException(['Please wait for your opponent to join.']);
    } else if (game.currentPlayer != socket.id) {
      throw new BadRequestException(['Please wait for your turn.']);
    }
    const maze = game.maze.find((v) => v.colId == body.colId && v.rowId == body.rowId);

    maze.mark(game.currentSymbol);
    this.io.to(body.gameId).emit('gameMazeMarked', {
      colId: body.colId,
      rowId: body.rowId,
      symbol: game.currentSymbol,
    });
    game.switchTurn();
    this.io.to(body.gameId).emit('gameTurn', { playerId: game.currentPlayer });
    this.io.to(body.gameId).emit('gameStats', { winner: game.winner, isEnded: game.isEnded, isDraw: game.isDraw });
  }

  async handleConnection(socket: Socket) {
    this.logger.log(`Player ${socket.id} tried connection from ${socket.conn.remoteAddress}`);
    const isNew = !socket.handshake.query['gameId'];
    const gameId = (isNew && this.gameService.createGame(socket.id)) || <string>socket.handshake.query['gameId'];
    let game: GameDto;
    try {
      game = this.gameService.getGameById(gameId);
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) {
        socket.emit('exception', error.getResponse());
      } else if (error instanceof Error) {
        socket.emit('exception', new InternalServerErrorException([error.message]).getResponse());
      }
      return socket.disconnect(true);
    }

    await socket.join(gameId);
    if (isNew) {
      socket.emit('gameCreated', { gameId });
    } else {
      this.gameService.joinToGame(gameId, socket.id);
    }

    this.logger.log(`Player ${socket.id} joined the game ${gameId}`);
    this.io.to(gameId).emit('gameJoined', { playerId: socket.id });
    this.io.to(gameId).emit('gameTurn', { playerId: game.currentPlayer });
  }

  async closeAllSockets() {
    if (process.env.NODE_ENV === 'test') {
      const sockets = await this.io.fetchSockets();
      for (const socket of sockets) {
        socket.disconnect(true);
      }
    }
  }
}
