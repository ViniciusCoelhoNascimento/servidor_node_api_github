require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const pool = require('./db');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const bodyParser = require('body-parser');
const app = express();
const PORT = 3000;
const client = redis.createClient({
    socket: {
        host: '127.0.0.1',
        port: 6379
    }
});

client.on('error', (err) => console.log('Redis Client Error', err));

(async () => {
    await client.connect();
    console.log('Conectado ao Redis!');
})();

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.json());
app.use(cors({
    origin: 'localhost'
}));

async function storeGHToken(gh_token, JWTToken) {
    await client.set(`github_token_from:${JWTToken}`, gh_token, 'EX', 7200);
}

async function storeRepos(repos, JWTToken) {
    await client.set(`github_repos:${tokenGH}`, JSON.stringify(repos), 'EX', 7200);
}

async function getGHToken(JWTToken) {
    return await client.get(`github_token_from:${JWTToken}`);
}

async function getRepos(JWTToken) {
    return await client.get(`github_repos:${tokenGH}`);
}

const generateJWTToken = (user) => {
    console.log(user.id, user.login, user.avatar_url)
    return jwt.sign(
        {
            id: user.id, login: user.login, avatar_url: user.avatar_url
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '12h'
        }
    );
};

app.get('/auth/github', (req, res)=>{
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user`
    res.redirect(githubAuthUrl);
});

app.get('/auth/callback', async (req, res)=>{
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: 'Código de autorização não encontrado' });
    }

    try {
        const response = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
        },{
            headers: { Accept: 'application/json'}
        });

        const GHToken = response.data.access_token;
        if (!GHToken){
            return res.status(400).json({error: 'Falha ao obter token de acesso'});
        }

        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${GHToken}`}
        });

        const userData = userResponse.data;

        const JWTtoken = generateJWTToken(userData);

        storeGHToken(GHToken, JWTtoken);

        res.redirect(`http://localhost:4200/auth-success?token=${JWTtoken}`);

    } catch (error) {
        console.error('Erro ao autenticar com GitHub:', error);
        res.status(500).json({error: 'Erro interno do servidor'});
    }
});

app.get('/get-repos', async (req, res) => {
    const tokenJWT = req.headers.authorization?.split(' ')[1];

    if (!tokenJWT) {
        return res.status(401).json({ error: 'tokenJWT não fornecido' });
    }

    let tokenGH;
    try {
        tokenGH = await getGHToken(tokenJWT);
        console.log("Token do GitHub:", tokenGH);
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao obter token do GitHub' });
    }

    try {
        const cachedRepos = await getRepos(tokenJWT);

        if (cachedRepos) {
            return res.json(JSON.parse(cachedRepos));
        }

        const response = await axios.get('https://api.github.com/user/repos', {
            headers: { Authorization: `Bearer ${tokenGH}` }
        });

        const repos = response.data;

        await storeRepos(repos, tokenJWT);

        res.json(repos);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar repositórios' });
    }
});

app.post('/repos', async (req, res) => {
    const { name } = req.body;
    const JWTToken = req.headers.authorization?.split(' ')[1];
    const tokenGH = await getGHToken(JWTToken);

    if (!JWTToken) {
        return res.status(401).json({ error: 'JWT não fornecido' });
    }

    if (!name) {
        return res.status(400).json({ error: "O nome do repositório é obrigatório" });
    }

    try {
        const response = await axios.post(
            "https://api.github.com/user/repos",
            {
                name: name,
                private: false,
                description: "Novo repositório",
                auto_init: true,
            },
            {
                headers: {
                    Authorization: `token ${tokenGH}`,
                    Accept: "application/vnd.github.v3+json",
                },
            }
        );

        res.json({
            message: "Repositório criado com sucesso!",
            repo_url: response.data.html_url,
        });
    } catch (error) {
        console.error("Erro ao criar repositório:", error.response.data);
        res.status(500).json({ error: "Erro ao criar repositório no git", details: error.response.data });
    }
});

app.get('/repos/favorites', async (req, res) => {
    const tokenJWT = req.headers.authorization?.split(' ')[1];

    if (!tokenJWT) {
        return res.status(401).json({ error: 'tokenJWT não fornecido' });
    }

    try {
        const result = await pool.query(`SELECT repo_name AS name FROM users_favs_repos WHERE jwt_token ='${tokenJWT}'`);
        res.json(result.rows);
    } catch (error){
        console.error('Erro ao buscar favoritos:', error);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.post('/repos/favorite', async (req, res) => {
    const { repo_name } = req.body;
    const tokenJWT = req.headers.authorization?.split(' ')[1];

    if (!tokenJWT) {
        return res.status(401).json({ error: 'tokenJWT não fornecido' });
    }

    if(!repo_name) {
        return res.status(400).json({
            error: 'repo_name é obrigatório'
        });
    }

    try {
        const result = await pool.query(
            'INSERT INTO users_favs_repos (jwt_token, repo_name) VALUES ($1, $2) RETURNING *',
            [tokenJWT, repo_name]
        );
        res.status(201).json({
            data: result.rows[0]
        });
    }catch (error) {
        console.error('Erro ao inserir repositório favorito:', error);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.listen(PORT, () => {
    console.log(`servidor rodando em http://localhost:${PORT}`);
});