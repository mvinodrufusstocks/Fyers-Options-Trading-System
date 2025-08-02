import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

export default function TradingDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [tokenInfo, setTokenInfo] = useState({
    accessToken: '',
    expiresAt: null,
    lastRefresh: null
  });
  
  const [fyersConfig, setFyersConfig] = useState({
    appId: '',
    secretKey: '',
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/api/auth/callback` : ''
  });

  const [tradingConfig, setTradingConfig] = useState({
    symbols: ['NSE:NIFTY50-INDEX', 'NSE:NIFTYBANK-INDEX', 'NSE:FINNIFTY-INDEX'],
    gammaThreshold: 0.05,
    thetaDecayMin: -0.1,
    spreadWidth: 50,
    monitoringInterval: 10000
  });

  const [marketData, setMarketData] = useState({});
  const [systemLogs, setSystemLogs] = useState([]);
  const intervalRef = useRef(null);

  // Exchange auth code for access token
  const exchangeAuthCodeForToken = async (authCode) => {
    try {
      const response = await fetch('/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          authCode,
          fyersConfig 
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.tokenInfo) {
        setTokenInfo(data.tokenInfo);
        setConnectionStatus('connected');
        addLog('Successfully obtained access token!', 'success');
        // Store in localStorage for persistence
        localStorage.setItem('fyersToken', JSON.stringify(data.tokenInfo));
      } else {
        addLog(`Token exchange failed: ${data.message}`, 'error');
        setConnectionStatus('error');
      }
    } catch (error) {
      addLog(`Token exchange error: ${error.message}`, 'error');
      setConnectionStatus('error');
    }
  };

  // Market Hours Check (IST)
  const isMarketOpen = () => {
    const now = new Date();
    const istTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const hour = istTime.getHours();
    const minute = istTime.getMinutes();
    const day = istTime.getDay();
    
    if (day === 0 || day === 6) return false;
    
    const currentMinutes = hour * 60 + minute;
    const marketOpen = 9 * 60 + 15; // 9:15 AM
    const marketClose = 15 * 60 + 30; // 3:30 PM
    
    return currentMinutes >= marketOpen && currentMinutes <= marketClose;
  };

  // Load saved token on startup
  useEffect(() => {
    const savedToken = localStorage.getItem('fyersToken');
    if (savedToken) {
      try {
        const parsedToken = JSON.parse(savedToken);
        setTokenInfo(parsedToken);
        addLog('Loaded saved token from storage', 'info');
      } catch (e) {
        console.error('Failed to parse saved token:', e);
      }
    }
  }, []);

  // Token validation
  const validateToken = async () => {
    try {
      const response = await fetch('/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenInfo, fyersConfig })
      });
      
      if (response.ok) {
        const data = await response.json();
        setConnectionStatus('connected');
        setTokenInfo(data.tokenInfo);
        addLog('Token validated successfully', 'success');
        return true;
      } else {
        setConnectionStatus('token_expired');
        addLog('Token validation failed', 'error');
        return false;
      }
    } catch (error) {
      addLog(`Token validation failed: ${error.message}`, 'error');
      setConnectionStatus('error');
      return false;
    }
  };

  // Generate FYERS auth URL - UPDATED TO USE SAME WINDOW
  const generateAuthUrl = () => {
    if (!fyersConfig.appId) {
      addLog('Please enter FYERS APP ID first', 'error');
      return;
    }
    
    const state = `auth_${Date.now()}`;
    const authUrl = `https://api-t1.fyers.in/api/v3/generate-authcode?` +
      `client_id=${fyersConfig.appId}&` +
      `redirect_uri=${encodeURIComponent(fyersConfig.redirectUri)}&` +
      `response_type=code&` +
      `state=${state}`;
    
    // Navigate in the same window instead of popup
    addLog('Redirecting to FYERS for authentication...', 'info');
    window.location.href = authUrl;
  };

  // Main monitoring function
  const runMonitoring = async () => {
    if (!isMarketOpen()) {
      addLog('Market is closed. Monitoring paused.', 'info');
      return;
    }

    if (!await validateToken()) {
      addLog('Invalid or expired token. Please refresh.', 'error');
      setIsRunning(false);
      return;
    }

    try {
      addLog('Starting monitoring cycle...', 'info');
      
      for (const symbol of tradingConfig.symbols) {
        const response = await fetch('/api/data/optionchain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            symbol, 
            tokenInfo, 
            fyersConfig 
          })
        });

        if (response.ok) {
          const data = await response.json();
          setMarketData(prev => ({ ...prev, [symbol]: data }));
          
          // Generate alerts
          const alertResponse = await fetch('/api/alerts/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              data, 
              symbol, 
              tradingConfig 
            })
          });

          if (alertResponse.ok) {
            const alertData = await alertResponse.json();
            if (alertData.alerts && alertData.alerts.length > 0) {
              setAlerts(prev => [...alertData.alerts, ...prev].slice(0, 50));
              addLog(`Generated ${alertData.alerts.length} alerts for ${symbol}`, 'success');
            }
          }
        } else {
          addLog(`Failed to fetch data for ${symbol}`, 'error');
        }
      }
      
      addLog('Monitoring cycle completed successfully', 'success');
    } catch (error) {
      addLog(`Monitoring error: ${error.message}`, 'error');
    }
  };

  // Add system log
  const addLog = (message, type = 'info') => {
    const log = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    };
    setSystemLogs(prev => [log, ...prev.slice(0, 49)]);
  };

  // Get display name for symbols
  const getSymbolDisplayName = (symbol) => {
    const symbolMap = {
      'NSE:NIFTY50-INDEX': 'NIFTY 50',
      'NSE:NIFTYBANK-INDEX': 'BANK NIFTY',
      'NSE:FINNIFTY-INDEX': 'FIN NIFTY'
    };
    return symbolMap[symbol] || symbol;
  };

  // Monitor effect
  useEffect(() => {
    if (isRunning && isMarketOpen() && connectionStatus === 'connected') {
      runMonitoring();
      intervalRef.current = setInterval(runMonitoring, tradingConfig.monitoringInterval);
    } else {
      clearInterval(intervalRef.current);
    }
    
    return () => clearInterval(intervalRef.current);
  }, [isRunning, tradingConfig.monitoringInterval, connectionStatus]);

  return (
    <>
      <Head>
        <title>FYERS Options Trading System</title>
        <meta name="description" content="Production-ready FYERS options trading system" />
      </Head>

      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h1 className="text-3xl font-bold mb-4 text-blue-600">
              🚀 FYERS Options Trading System
            </h1>
            
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              connectionStatus === 'connected' ? 'bg-green-100 text-green-800' : 
              connectionStatus === 'token_expired' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {connectionStatus === 'connected' ? '🟢 Connected to FYERS' : 
               connectionStatus === 'token_expired' ? '🟡 Token Expired' :
               '🔴 Disconnected'}
            </div>

            <div className="mt-4 text-sm text-gray-600">
              Market Status: {isMarketOpen() ? 
                <span className="text-green-600 font-medium">🟢 Open (9:15 AM - 3:30 PM IST)</span> : 
                <span className="text-red-600 font-medium">🔴 Closed</span>
              }
            </div>
          </div>

          {/* Configuration Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* FYERS Configuration */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4 text-blue-600">🔑 FYERS Configuration</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">APP ID</label>
                  <input
                    type="text"
                    value={fyersConfig.appId}
                    onChange={(e) => setFyersConfig({...fyersConfig, appId: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your FYERS APP ID"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Secret Key</label>
                  <input
                    type="password"
                    value={fyersConfig.secretKey}
                    onChange={(e) => setFyersConfig({...fyersConfig, secretKey: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your FYERS Secret Key"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Redirect URI</label>
                  <input
                    type="text"
                    value={fyersConfig.redirectUri}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">Auto-generated based on your domain</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-6">
                <button
                  onClick={generateAuthUrl}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md font-medium transition-colors"
                >
                  🔗 Generate Auth URL
                </button>
                <button
                  onClick={validateToken}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md font-medium transition-colors"
                >
                  ✅ Validate Token
                </button>
              </div>

              {/* Token Status */}
              {tokenInfo.accessToken && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-sm text-gray-700 mb-2">Token Status</h3>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p><strong>Status:</strong> {tokenInfo.accessToken ? 'Present' : 'Not set'}</p>
                    <p><strong>Expires:</strong> {tokenInfo.expiresAt ? new Date(tokenInfo.expiresAt).toLocaleString() : 'Unknown'}</p>
                    <p><strong>Last Refresh:</strong> {tokenInfo.lastRefresh ? new Date(tokenInfo.lastRefresh).toLocaleString() : 'Never'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Trading Configuration */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4 text-purple-600">⚙️ Trading Configuration</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Gamma Threshold</label>
                  <input
                    type="number"
                    step="0.001"
                    value={tradingConfig.gammaThreshold}
                    onChange={(e) => setTradingConfig({
                      ...tradingConfig, 
                      gammaThreshold: parseFloat(e.target.value) || 0
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Min gamma difference for spreads</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Min Theta Decay</label>
                  <input
                    type="number"
                    step="0.01"
                    value={tradingConfig.thetaDecayMin}
                    onChange={(e) => setTradingConfig({
                      ...tradingConfig, 
                      thetaDecayMin: parseFloat(e.target.value) || 0
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Min theta for decay alerts</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Spread Width</label>
                  <input
                    type="number"
                    value={tradingConfig.spreadWidth}
                    onChange={(e) => setTradingConfig({
                      ...tradingConfig, 
                      spreadWidth: parseInt(e.target.value) || 50
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Max strike difference</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Interval (ms)</label>
                  <input
                    type="number"
                    value={tradingConfig.monitoringInterval}
                    onChange={(e) => setTradingConfig({
                      ...tradingConfig, 
                      monitoringInterval: parseInt(e.target.value) || 10000
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Data refresh frequency</p>
                </div>
              </div>

              {/* Monitored Symbols */}
              <div className="mt-4">
                <h3 className="font-medium text-sm text-gray-700 mb-2">Monitored Symbols</h3>
                <div className="flex flex-wrap gap-2">
                  {tradingConfig.symbols.map(symbol => (
                    <span key={symbol} className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                      {getSymbolDisplayName(symbol)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Control Panel */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex flex-wrap gap-3 items-center">
              <button
                onClick={() => setIsRunning(!isRunning)}
                disabled={connectionStatus !== 'connected'}
                className={`px-6 py-3 rounded-md font-medium transition-colors ${
                  isRunning 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-400 disabled:cursor-not-allowed'
                }`}
              >
                {isRunning ? '⏸️ Stop Monitoring' : '▶️ Start Monitoring'}
              </button>
              
              <button
                onClick={runMonitoring}
                disabled={connectionStatus !== 'connected'}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-md font-medium disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                🔄 Manual Scan
              </button>

              <button
                onClick={() => setAlerts([])}
                className="px-4 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-md font-medium transition-colors"
              >
                🗑️ Clear Alerts
              </button>

              <div className="ml-auto text-sm text-gray-600">
                <div>Monitoring: {isRunning ? 
                  <span className="text-green-600 font-medium">Active</span> : 
                  <span className="text-gray-500">Inactive</span>
                }</div>
                <div>Alerts: <span className="font-medium">{alerts.length}</span></div>
              </div>
            </div>
          </div>

          {/* Live Data & Alerts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Market Data */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold mb-4 text-blue-600">📊 Live Market Data</h3>
              
              {Object.keys(marketData).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📈</div>
                  <p>No market data yet.</p>
                  <p className="text-sm">Start monitoring to see live data.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(marketData).map(([symbol, data]) => (
                    <div key={symbol} className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-lg">{getSymbolDisplayName(symbol)}</span>
                        <span className="text-2xl font-bold text-blue-600">
                          ₹{data.spot?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 flex justify-between">
                        <span>Options: {data.optionsCount || 0}</span>
                        <span>Updated: {new Date().toLocaleTimeString()}</span>
                      </div>
                      {data.timestamp && (
                        <div className="text-xs text-gray-500 mt-1">
                          Last fetch: {new Date(data.timestamp).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trading Alerts */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold mb-4 text-red-600">🚨 Trading Alerts</h3>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">🔔</div>
                    <p>No alerts yet.</p>
                    <p className="text-sm">
                      {!isMarketOpen() ? 'Market is closed.' : 'Start monitoring to see opportunities.'}
                    </p>
                  </div>
                ) : (
                  alerts.map(alert => (
                    <div key={alert.id} className={`p-4 rounded-lg border-l-4 ${
                      alert.type === 'GAMMA_SPREAD' 
                        ? 'bg-blue-50 border-blue-500' 
                        : 'bg-yellow-50 border-yellow-500'
                    } ${alert.priority === 'HIGH' ? 'ring-2 ring-red-200' : ''}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-sm">{getSymbolDisplayName(alert.symbol)}</span>
                            {alert.priority === 'HIGH' && (
                              <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full font-medium">
                                HIGH
                              </span>
                            )}
                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                              alert.type === 'GAMMA_SPREAD' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {alert.type.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="font-medium text-gray-900 text-sm mb-1">{alert.message}</p>
                          <p className="text-xs text-gray-600">{alert.details}</p>
                        </div>
                        <div className="text-right ml-4">
                          <span className="text-xs text-gray-500">
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* System Logs */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-700">📝 System Logs</h3>
              <button
                onClick={() => setSystemLogs([])}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-md transition-colors"
              >
                Clear Logs
              </button>
            </div>
            
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {systemLogs.length === 0 ? (
                <p className="text-gray-500 italic text-center py-4">No system logs yet.</p>
              ) : (
                systemLogs.map(log => (
                  <div key={log.id} className={`p-2 rounded text-sm ${
                    log.type === 'error' ? 'bg-red-50 text-red-800' :
                    log.type === 'warning' ? 'bg-yellow-50 text-yellow-800' :
                    log.type === 'success' ? 'bg-green-50 text-green-800' :
                    'bg-gray-50 text-gray-700'
                  }`}>
                    <span className="font-medium text-xs">[{log.timestamp}]</span> {log.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
