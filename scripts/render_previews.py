"""CPU preview renderer for the GLB assets (no OpenGL/Blender runtime needed).

Run: python scripts/render_previews.py
Dependencies: numpy, trimesh, numba, pillow. Produces antialiased studio previews.
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh
from numba import njit

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'previews'; OUT.mkdir(exist_ok=True)
WIDTH,HEIGHT=1080,700
SS=1
W,H=WIDTH*SS,HEIGHT*SS

@njit(cache=True)
def raster(v, colors, faces, zbuf, canvas):
    for i in range(len(faces)):
        a,b,c=faces[i]; x0,y0,z0=v[a]; x1,y1,z1=v[b]; x2,y2,z2=v[c]
        denominator=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0)
        if abs(denominator)<1e-7:continue
        xmin=max(0,int(min(x0,x1,x2))); xmax=min(canvas.shape[1]-1,int(max(x0,x1,x2))+1)
        ymin=max(0,int(min(y0,y1,y2))); ymax=min(canvas.shape[0]-1,int(max(y0,y1,y2))+1)
        if xmax<xmin or ymax<ymin:continue
        for y in range(ymin,ymax+1):
            for x in range(xmin,xmax+1):
                px=x+.5;py=y+.5
                u=((px-x0)*(y2-y0)-(py-y0)*(x2-x0))/denominator
                w=((x1-x0)*(py-y0)-(y1-y0)*(px-x0))/denominator
                if u>=0 and w>=0 and u+w<=1:
                    depth=z0*(1-u-w)+z1*u+z2*w
                    if depth<zbuf[y,x]:
                        zbuf[y,x]=depth
                        canvas[y,x,0]=colors[i,0]; canvas[y,x,1]=colors[i,1]; canvas[y,x,2]=colors[i,2]


def render(asset):
    scene=trimesh.load(asset,force='scene',process=False)
    # Orthographic camera: see the front and driver's side and the roof.
    eye=np.array([6.8,-8.9,5.0]); eye/=np.linalg.norm(eye)
    right=np.cross(np.array([0.,0.,1.]),eye); right/=np.linalg.norm(right)
    up=np.cross(eye,right)
    scale=185*SS
    verts=[]; cols=[]; faces=[]
    light=np.array([-.23,-.51,.83]);light/=np.linalg.norm(light)
    geometry=list(scene.dump())
    for mesh in geometry:
        if not isinstance(mesh,trimesh.Trimesh):continue
        base=np.array(mesh.visual.material.baseColorFactor[:3],dtype=float)/255.0
        # ACES-like tonemapping from linear PBR base to display colors.
        base=np.clip(base**.55,0,1)
        material=mesh.visual.material.name or ''
        metallic=mesh.visual.material.metallicFactor or 0
        rough=mesh.visual.material.roughnessFactor or .5
        start=len(verts)
        world=mesh.vertices
        proj=np.column_stack((W/2+world@right*scale,
                              H*.58-world@up*scale,
                              -world@eye))
        verts.extend(proj)
        for tri,n in zip(mesh.faces,mesh.face_normals):
            n=np.array(n)
            # two-sided shading for thin painted panels and glazing
            diffuse=.53+.41*abs(n@light)
            refl=max(0,n@(-eye+light)/np.linalg.norm(-eye+light))**(6+26*(1-rough))
            spec=.22*metallic*refl
            if material=='glass':
                diffuse=.48+.34*abs(n@light)
                spec+=.07*refl
            color=np.clip(base*diffuse+spec,0,1)
            if material=='lights':color=np.clip(color*1.7+.23,0,1)
            if material=='chrome':color=np.clip(color*1.2+.12,0,1)
            cols.append((color*255).astype(np.uint8));faces.append(tri+start)
    # Matte studio background with a subtle horizonless gradient.
    yy,xx=np.mgrid[0:H,0:W]
    bg=np.zeros((H,W,3),dtype=np.uint8)
    grad=234-15*(yy/H)+7*np.exp(-((yy-H*.58)/(H*.3))**2)
    for i,shift in enumerate((0,2,4)):bg[:,:,i]=np.uint8(np.clip(grad+shift,0,255))
    # Ground contact shadow underneath the vehicle.
    shadow=np.exp(-(((xx-W*.50)/(W*.36))**2+((yy-H*.80)/(H*.092))**2)*2)
    bg=np.uint8(np.clip(bg.astype(float)-shadow[:,:,None]*44,0,255))
    zbuf=np.full((H,W),1e10,dtype=np.float32)
    raster(np.array(verts,dtype=np.float32),np.array(cols,dtype=np.uint8),np.array(faces,dtype=np.int32),zbuf,bg)
    im=Image.fromarray(bg,'RGB')
    d=ImageDraw.Draw(im)
    title=asset.stem.replace('_',' ').upper()
    d.text((46,40),title,fill=(32,43,49))
    d.text((46,62),'ORIGINAL CONCEPT  /  PBR GAME ASSET',fill=(107,119,125))
    d.text((46,H-49),'STUDIO VIEW   /   METRIC SCALE   /   GLTF 2.0',fill=(107,119,125))
    out=OUT/(asset.stem+'.png');im.save(out,optimize=True)
    print(out.relative_to(ROOT),len(faces),'triangles')

if __name__=='__main__':
    for path in sorted((ROOT/'assets').glob('*.glb')):render(path)
