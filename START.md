# Lancer l'application

## Backend
```powershell
cd backend
python main.py
```

## Frontend
```powershell
cd frontend
npm run dev
```

## Arrêter le backend
```powershell
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
```

## URLs
- Interface : http://localhost:3000
- API : http://localhost:8000
