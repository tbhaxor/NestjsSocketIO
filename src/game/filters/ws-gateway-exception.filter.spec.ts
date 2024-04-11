import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { WsGatewayExceptionFilter } from './ws-gateway-exception.filter';
import { faker } from '@faker-js/faker';
import { Socket } from 'socket.io';

// Mocking the socket client
const mockSocket: Pick<Socket, 'emit'> = {
  emit: jest.fn(),
};

// Mocking the ArgumentsHost
const mockArgumentsHost: Pick<ArgumentsHost, 'switchToWs'> = {
  switchToWs: jest.fn().mockReturnValue({
    getClient: jest.fn().mockReturnValue(mockSocket),
  }),
};

describe('BadRequestFilter', () => {
  let exception: BadRequestException;

  beforeAll(() => {
    exception = new BadRequestException(faker.lorem.slug());
  });

  it('should be defined', () => {
    expect(new WsGatewayExceptionFilter()).toBeDefined();
  });

  it('should emit the values of getRespone() through socket', () => {
    const badRequestFilter = new WsGatewayExceptionFilter();

    // TODO: Check if we can remove the @ts-ignore
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    badRequestFilter.catch(exception, mockArgumentsHost);

    expect(mockArgumentsHost.switchToWs).toHaveBeenCalled();
    expect(mockArgumentsHost.switchToWs().getClient).toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith('exception', exception.getResponse());
  });
});
