# Publicar o Nora

O Nora é um site estático. Gere o diretório de publicação com `npm run publicar`; a saída fica em `dist/`, incluindo `_headers` na raiz. Cloudflare Pages e Netlify leem esse arquivo para enviar a política de segurança e os outros cabeçalhos HTTP.

## Cloudflare Pages

1. No painel da Cloudflare, crie um projeto Pages conectado ao repositório Git.
2. Escolha o ramo de produção e use a raiz do projeto como diretório raiz.
3. Defina `npm run publicar` como comando de build e `dist` como diretório de saída.
4. Salve e aguarde a primeira publicação. Confirme que a implantação publicou `_headers` na raiz do site.

## Netlify

1. No painel da Netlify, adicione um site importando o repositório Git.
2. Use a raiz do projeto como diretório base, defina `npm run publicar` como comando de build e `dist` como diretório de publicação.
3. Salve e aguarde a publicação. Confirme que `_headers` está na raiz do site.

O arquivo `_headers` aplica-se aos caminhos publicados pelo provedor. O GitHub Pages não oferece configuração de cabeçalhos HTTP por arquivo `_headers`; use Cloudflare Pages ou Netlify para publicar com estes cabeçalhos.
