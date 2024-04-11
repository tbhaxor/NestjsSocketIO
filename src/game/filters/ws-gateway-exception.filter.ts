import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, NotFoundException } from '@nestjs/common';
import { Socket } from 'socket.io';

@Catch(BadRequestException, NotFoundException)
export class WsGatewayExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const socket: Socket = host.switchToWs().getClient();
    socket.emit('exception', exception.getResponse());
  }
}
