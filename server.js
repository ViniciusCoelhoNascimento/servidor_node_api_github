require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const pool = require('./db');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;

app.use(cookieParser());
app.use(cors({origin: 'http://localhost:5173', credentials: true}));
app.use(express.json());
/*
async function storeToken(userId, accessToken) {
    await client.set(`github_token:${userId}`, accessToken, 'EX', 3600); // Expira em 1 hora
}

async function getToken(userId) {
    return await client.get(`github_token:${userId}`);
}
*/


//Gera o JWT
const generateToken = (user) => {
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
    console.log('client id: ' + process.env.GITHUB_CLIENT_ID)
    console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Carregado' : 'Não carregado');
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

        const accessToken = response.data.access_token;
        if (!accessToken){
            return res.status(400).json({error: 'Falha ao obter token de acesso'});
        }

        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${accessToken}`}
        });

        const userData = userResponse.data;

        const token = generateToken(userData)

        res.json({ token, userData});

    } catch (error) {
        console.error('Erro ao autenticar com GitHub:', error);
        res.status(500).json({error: 'Erro interno do servidor'});
    }
});

// Rota protegida que exige JWT
app.get('/api/protected', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]; // Pega o token do header

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verifica o token
        res.json({ message: 'Acesso permitido', user: decoded });
    } catch (error) {
        res.status(401).json({ error: 'Token inválido' });
    }
});

//acessar api do github
app.get('/api/repos', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];

    if(!token){
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verifica o token
        res.json({ message: 'Acesso permitido', user: decoded });
    } catch (error) {
        res.status(401).json({ error: 'Token inválido' });
    }

    try{
        const response = await axios.get('https://api.github.com/user/repos',{
            headers: { Authorization: `Bearer ${token}`}
        });

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar repositórios' });
    }
});

app.listen(PORT, () => {
    console.log(`servidor rodando em http://localhost:${PORT}`)
    console.log(`redirecionar ao github: http://localhost:${PORT}/auth/github`)
    console.log(`rota protegida teste: http://localhost:${PORT}/api/protected`)
    
})

/*
app.get('/', (req, res) => {
    res.send('olá mundo');
});

app.get('/usuarios', async (req, res) => {
    try {
        const result = await pool.query('Select * from usuarios');
        res.json(result.rows);
    }
    catch (error){
        console.error('Erro ao buscar usuários: ', error);
        res.status(500).send('Erro no servidor');
    }
});
*/