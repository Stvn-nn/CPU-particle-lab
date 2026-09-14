"""Launch Particle Lab locally using only the Python standard library."""
import argparse
import functools
import http.server
import mimetypes
from pathlib import Path
import threading
import webbrowser

ROOT=Path(__file__).resolve().parent
mimetypes.add_type('text/javascript','.js')

class LocalHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        super().end_headers()
    def log_message(self,format,*args):
        if args and str(args[1] if len(args)>1 else '') not in ('200','304'):
            super().log_message(format,*args)
    def list_directory(self,path):
        self.send_error(404,'Not found')
        return None

def main():
    parser=argparse.ArgumentParser(description='Run Particle Lab on this computer.')
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    if not 0<=args.port<=65535:parser.error('Port must be between 0 and 65535.')
    handler=functools.partial(LocalHandler,directory=str(ROOT/'web'))
    try:server=http.server.ThreadingHTTPServer(('127.0.0.1',args.port),handler)
    except OSError as exc:
        print(f'Could not start: {exc}\nTry: python app.py --port 8766')
        return 1
    server.daemon_threads=True
    url=f'http://127.0.0.1:{server.server_address[1]}'
    print(f'Particle Lab is ready: {url}\nKeep this terminal open. Press Ctrl+C to stop.',flush=True)
    if not args.no_browser:
        timer=threading.Timer(.6,lambda:webbrowser.open(url));timer.daemon=True;timer.start()
    try:server.serve_forever()
    except KeyboardInterrupt:print('\nParticle Lab stopped.')
    finally:server.server_close()
    return 0

if __name__=='__main__':raise SystemExit(main())
