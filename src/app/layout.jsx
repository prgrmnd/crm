import "./globals.css";

export const metadata = {
  title: "Luz da Esperança · CRM",
  icons: { icon: { url: "/favicon.png", type: "image/png" } },
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#5B8C3E",
};

const initialTheme = `(()=>{let theme;try{theme=localStorage.getItem('luz-crm-theme')}catch{}if(!['light','dark'].includes(theme))theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=theme;if(theme==='dark')document.querySelector('meta[name="theme-color"]').content='#151c18'})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initialTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
