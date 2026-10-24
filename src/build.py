import re
import os
S=os.path.dirname(os.path.abspath(__file__))+'/'; G=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))+'/'
t=open(S+'template.html').read()
t=t.replace('/*ORBJS*/',open(S+'orb.js').read()).replace('/*APPJS*/',open(S+'app.js').read())
old='Banedataene fornyes én gang i døgnet'
if old in t: t=t.replace(old,'Banedataene fornyes automatisk to ganger i døgnet')
i=t.index('</style>')+len('</style>'); head, body = t[:i], t[i:]
for drop in ['<title>Satellittvakt Narvik</title>\n','<meta name="claude:viewport-fit-sides" content="cover">\n']: head=head.replace(drop,'')
head=re.sub(r'<meta name="description"[^>]*>\n','',head)
desc='Se satellittene og nordlyset over Narvik i sanntid i 3D: Starlink, rakettrinn, romstasjoner og nordlysvarsel.'
icon=("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23060a13'/%3E"
      "%3Cpath d='M8 46a30 30 0 0 1 48 0' fill='none' stroke='%236dfbb0' stroke-width='3'/%3E%3Ccircle cx='40' cy='22' r='6' fill='%23ffc66b'/%3E%3C/svg%3E")
reset=("<style>\n*,*::before,*::after{box-sizing:border-box}\nhtml{-webkit-text-size-adjust:100%}\n"
       ":root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}\n"
       "body{margin:0}\nimg{max-width:100%}\n[hidden]{display:none!important}\n</style>\n")
doc=('<!doctype html>\n<html lang="nb">\n<head>\n<meta charset="utf-8">\n'
     '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
     '<title>Satellittvakt Narvik</title>\n'
     f'<meta name="description" content="{desc}">\n<meta property="og:title" content="Satellittvakt Narvik">\n'
     f'<meta property="og:description" content="{desc}">\n<meta property="og:type" content="website">\n'
     '<meta name="theme-color" content="#060a13">\n'
     f'<link rel="icon" href="{icon}">\n' + reset + head + '\n</head>\n<body>\n' + body.strip() + '\n</body>\n</html>\n')
open(G+'index.html','w').write(doc); print('built', len(doc))
