import { createParamDecorator, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

function decodeBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf-8');
}

function parseBearerToken(authHeader) {
  if (!authHeader) {
    throw new UnauthorizedException('Missing authorization header');
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedException('Invalid authorization header format');
  }

  return token;
}

function verifyJwt(token) {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new UnauthorizedException('Invalid token');
  }

  const header = JSON.parse(decodeBase64Url(encodedHeader));
  if (header.alg !== 'HS256') {
    throw new UnauthorizedException('Unsupported token algorithm');
  }

  const secret = process.env.JWT_SECRET || 'development-secret-change-me';
  const expectedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  const supplied = Buffer.from(encodedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new UnauthorizedException('Invalid token signature');
  }

  const decoded = JSON.parse(decodeBase64Url(encodedPayload));
  if (decoded.exp && decoded.exp * 1000 < Date.now()) {
    throw new UnauthorizedException('Token expired');
  }

  if (!(decoded.sub || decoded.userId) || !decoded.role) {
    throw new UnauthorizedException('Token missing required claims');
  }

  return {
    userId: decoded.sub || decoded.userId,
    role: decoded.role,
    email: decoded.email,
    token,
  };
}

export const JwtAuth = createParamDecorator((data, ctx) => {
  const request = ctx.switchToHttp().getRequest();
  return verifyJwt(parseBearerToken(request.headers.authorization));
});

/**
 * Decorator to extract current user from request
 */
export const CurrentUser = createParamDecorator((data, ctx) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});

/**
 * Middleware to extract user from JWT token
 */
export function JwtAuthMiddleware() {
  return (req, res, next) => {
    try {
      req.user = verifyJwt(parseBearerToken(req.headers.authorization));
      next();
    } catch (error) {
      const status = error.getStatus ? error.getStatus() : 401;
      res.status(status).json({
        success: false,
        statusCode: status,
        message: error.message || 'Unauthorized',
        timestamp: new Date().toISOString(),
        path: req.originalUrl || req.url,
      });
    }
  };
}
