import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import chatRouter from './routes/chat.js';
import trackMetadataRouter from './routes/trackMetadata.js';
import healthRouter from './routes/health.js';
import settingsRouter from './routes/settings.js';
import taxonomyRouter from './routes/taxonomy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Security headers
app.use(helmet());

// CORS configuration - restrict to specific origins in production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3001'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '10mb' })); // Add size limit for security

// API routes
app.use('/api', healthRouter); // Health checks first (no auth needed)
app.use('/api', settingsRouter); // Settings API
app.use('/api', chatRouter);
app.use('/api', trackMetadataRouter);
app.use('/api/taxonomy', taxonomyRouter); // Taxonomy parsing API

// Production: serve client build
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
