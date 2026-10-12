import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/db';

export const dynamic = 'force-dynamic';

function redirect(request, message, campaign) {
  const destination = new URL('/', request.headers.get('origin'));
  destination.searchParams.set('notice', message);
  if (campaign) {
    destination.searchParams.set('campagne', campaign);
  }
  return NextResponse.redirect(destination, 303);
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const requestHost = forwardedHost || request.headers.get('host');
  const forwardedProtocol = request.headers.get('x-forwarded-proto');
  const requestProtocol = (forwardedProtocol || new URL(request.url).protocol.slice(0, -1))
    .split(',')[0]
    .trim();

  let originUrl;
  try {
    originUrl = origin ? new URL(origin) : null;
  } catch {
    originUrl = null;
  }

  if (
    !originUrl
    || !requestHost
    || originUrl.host.toLowerCase() !== requestHost.toLowerCase()
    || originUrl.protocol !== `${requestProtocol}:`
  ) {
    return new NextResponse('Origine de requête invalide.', { status: 403 });
  }

  const form = await request.formData();
  const operation = form.get('operation');
  const personnage = Number(form.get('personnage'));
  const montant = Number(form.get('montant'));
  const motif = String(form.get('motif') || 'Action de la page web').slice(0, 200);
  const campaign = String(form.get('campagne') || '');

  if (!Number.isSafeInteger(personnage) || personnage <= 0) {
    return redirect(request, 'Identifiant de personnage invalide.', campaign);
  }

  try {
    const sql = getDb();

    if (operation === 'degats' || operation === 'soin') {
      if (!Number.isSafeInteger(montant) || montant <= 0) {
        return redirect(request, 'Le nombre de points doit être un entier positif.', campaign);
      }

      const delta = operation === 'degats' ? -montant : montant;
      await sql`CALL modifier_pv(${personnage}, ${delta}, ${motif});`;
      return redirect(request, operation === 'degats' ? 'Dégâts appliqués.' : 'Soin appliqué.', campaign);
    }

    if (operation === 'd20') {
      const [result] = await sql`
        SELECT lancer_de(${personnage}, 20, 'attaque') AS total;
      `;
      return redirect(request, `Jet d20 pour le personnage ${personnage} : ${result.total}.`, campaign);
    }

    return redirect(request, 'Opération inconnue.', campaign);
  } catch (error) {
    return redirect(request, `Échec de l’action : ${error.message}`, campaign);
  }
}
