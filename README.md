# Node.js Project

## Requisitos
- Node.js v16 ou superior
- PostgreSQL
- Redis

## Instalação

Clone o repositório:
```sh
 git clone https://github.com/ViniciusCoelhoNascimento/github-api-front.git
 cd github-api-front
```

Instale as dependências do projeto:
```sh
 npm install
```

Instale os pacotes necessários:
```sh
 npm install dotenv express axios cookie-parser cors pg jsonwebtoken redis body-parser
```

## Configuração

Crie um arquivo `.env` e defina as variáveis de ambiente necessárias, como credenciais do banco de dados e chaves secretas.
Exemplo:
  PORT=3000
  DB_USER=seu_usuario
  DB_PASSWORD=sua_senha
  DB_HOST=localhost
  DB_NAME=seu_banco
  JWT_SECRET=sua_chave_secreta

## Execução

Para iniciar o servidor:
```sh
 node index.js
```

## Banco de Dados

Certifique-se de que o PostgreSQL está instalado e rodando.
Crie o banco de dados:
  CREATE DATABASE seu_banco;

E rode este comando para criar a tabela necessária:
  CREATE TABLE users_favs_repos (
    id SERIAL PRIMARY KEY,
    jwt_token TEXT NOT NULL,
    repo_name TEXT NOT NULL
);

## Redis

Para utilizar o Redis, inicie o serviço com:
```sh
 redis-server
```

## Aviso
Recomenda-se rodar este projeto em um ambiente Linux para melhor compatibilidade e desempenho.

## Licença
Este projeto está licenciado sob a MIT License.

