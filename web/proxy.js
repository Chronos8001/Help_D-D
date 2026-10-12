import { NextResponse } from 'next/server';

function unauthorized() {
  return new NextResponse('Authentification requise', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Grimoire"' },
  });
}

export function proxy(request) {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return new NextResponse('Configuration d’authentification absente.', { status: 503 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const separator = authHeader.indexOf(' ');
  const scheme = authHeader.slice(0, separator);
  const encoded = authHeader.slice(separator + 1);

  if (separator < 0 || scheme.toLowerCase() !== 'basic' || !encoded) {
    return unauthorized();
  }

  try {
    const credentials = atob(encoded);
    const delimiter = credentials.indexOf(':');
    if (delimiter < 0) {
      return unauthorized();
    }

    const username = credentials.slice(0, delimiter);
    const password = credentials.slice(delimiter + 1);
    if (username === expectedUser && password === expectedPassword) {
      return NextResponse.next();
    }
  } catch {
    return unauthorized();
  }

  return unauthorized();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
};
