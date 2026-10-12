import './globals.css';

export const metadata = {
  title: 'Grimoire',
  description: 'Table de jeu D&D',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
