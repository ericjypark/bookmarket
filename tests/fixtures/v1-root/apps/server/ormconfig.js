module.exports = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: true,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/**/*.js'],
  cli: {
    migrationsDir: 'src/migrations',
  },
};
