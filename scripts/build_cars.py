"""Generate three original, self-contained PBR glTF car assets.

Run: python scripts/build_cars.py  (requires numpy, trimesh, pillow)
Units: metres. X is forward, Z is up; wheels sit on Z=0.
All surfaces are tessellated with rounded contours; no external textures required.
"""
from pathlib import Path
import math
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets'
OUT.mkdir(exist_ok=True)

PALETTE = {
    'paint': ((0.095, .24, .43, 1), .29, .78),
    'dark_paint': ((.025, .072, .12, 1), .35, .72),
    'glass': ((.027, .082, .105, 1), .14, .36),
    'rubber': ((.019, .022, .026, 1), .92, .0),
    'rim': ((.65, .71, .74, 1), .28, .83),
    'rim_dark': ((.13, .16, .18, 1), .4, .7),
    'chrome': ((.81, .85, .86, 1), .18, 1),
    'black': ((.012, .016, .02, 1), .48, .05),
    'lights': ((.85, .94, 1, 1), .13, .15),
    'taillight': ((.8, .015, .025, 1), .17, .13),
    'amber': ((1, .35, .028, 1), .18, .1),
    'interior': ((.057, .054, .048, 1), .85, .0),
}


def make_mesh(scene, name, vertices, faces, mat, color=None):
    if not len(vertices) or not len(faces):
        return
    m = trimesh.Trimesh(vertices=np.asarray(vertices), faces=np.asarray(faces), process=False)
    base, rough, metal = PALETTE[mat]
    if color is not None:
        base = color
    material = PBRMaterial(name=mat, baseColorFactor=list(base),
                           metallicFactor=metal, roughnessFactor=rough,
                           doubleSided=True)
    m.visual = trimesh.visual.TextureVisuals(material=material)
    scene.add_geometry(m, node_name=name, geom_name=name)


def surface(scene, name, rows, mat, color=None, closed=False, flip=False):
    """Quad-strip a grid of coordinates. Rows follow vehicle length or panel path."""
    verts = [p for row in rows for p in row]
    n = len(rows[0]); faces = []
    for i in range(len(rows)-1):
        for j in range(n if closed else n-1):
            k = (j+1) % n
            f = (i*n+j, i*n+k, (i+1)*n+k)
            faces.extend([f, (i*n+j, (i+1)*n+k, (i+1)*n+j)])
    if flip: faces = [f[::-1] for f in faces]
    make_mesh(scene, name, verts, faces, mat, color)


def box(scene, name, center, size, mat):
    m = trimesh.creation.box(extents=size)
    m.apply_translation(center)
    base, rough, metal = PALETTE[mat]
    m.visual = trimesh.visual.TextureVisuals(material=PBRMaterial(name=mat, baseColorFactor=base,
                                metallicFactor=metal, roughnessFactor=rough, doubleSided=True))
    scene.add_geometry(m, node_name=name, geom_name=name)


def tube(scene, name, points, radius, mat, sides=8, color=None):
    """Continuous rounded trim without sharp corners at the joins."""
    points = np.array(points, dtype=float)
    if len(points)<2: return
    rows=[]
    for i,p in enumerate(points):
        tang = points[min(i+1,len(points)-1)]-points[max(i-1,0)]
        tang /= max(np.linalg.norm(tang), 1e-9)
        axis = np.array([0,0,1.]) if abs(tang[2])<.85 else np.array([0,1.,0])
        a=np.cross(tang,axis); a/=max(np.linalg.norm(a),1e-9)
        b=np.cross(tang,a)
        rows.append([p+radius*(a*math.cos(2*math.pi*j/sides)+b*math.sin(2*math.pi*j/sides)) for j in range(sides)])
    surface(scene,name,rows,mat,color,closed=True)


def torus(scene,name,center,major,minor,mat,axis='y',segments=36,ring=8):
    rows=[]
    for i in range(segments+1):
        t=2*math.pi*i/segments
        row=[]
        for j in range(ring):
            u=2*math.pi*j/ring
            r=major+minor*math.cos(u)
            if axis=='y': p=[center[0]+r*math.cos(t),center[1]+minor*math.sin(u),center[2]+r*math.sin(t)]
            else: p=[center[0]+r*math.cos(t),center[1]+r*math.sin(t),center[2]+minor*math.sin(u)]
            row.append(p)
        rows.append(row)
    surface(scene,name,rows,mat,closed=True)


def cylinder_y(scene,name,x,y,z,r,depth,mat,seg=36):
    vs=[];fs=[]
    for yy in (y-depth/2,y+depth/2):
        for k in range(seg):
            a=2*math.pi*k/seg
            vs.append((x+r*math.cos(a),yy,z+r*math.sin(a)))
    for k in range(seg):
        j=(k+1)%seg
        fs += [(k,j,seg+j),(k,seg+j,seg+k)]
    for k in range(1,seg-1): fs += [(0,k+1,k),(seg,seg+k,seg+k+1)]
    make_mesh(scene,name,vs,fs,mat)


def wheel(scene, name,x,y,z,r,sign, style):
    # Tire profile including rounded sidewall/shoulder and shoulder tread.
    width=.26 if style!='suv' else .31
    outer=y+sign*.035
    inner=y-sign*(width-.035)
    yz=[(inner,r*.76),(inner-sign*.018,r*.86),(inner-sign*.015,r*.96),
        (inner+sign*.03,r),(outer-sign*.035,r),(outer+sign*.006,r*.96),
        (outer+sign*.024,r*.85),(outer,r*.75)]
    rows=[]
    for k in range(49):
        a=2*math.pi*k/48
        rows.append([[x+rad*math.cos(a),yy,z+rad*math.sin(a)] for yy,rad in yz])
    surface(scene,name+'_rounded_tire',rows,'rubber',closed=False)
    facey=outer+sign*.027
    cylinder_y(scene,name+'_brake_disc',x,facey-sign*.048,z,r*.68,.023,'rim_dark')
    cylinder_y(scene,name+'_wheel_barrel',x,facey-sign*.019,z,r*.71,.035,'rim_dark')
    torus(scene,name+'_polished_lip',(x,facey,z),r*.725,.012,'chrome')
    # Deep openings between paired spokes reveal the brake disc behind.
    count=5 if style!='suv' else 6
    for i in range(count):
        ang=2*math.pi*i/count + .11
        for offset in (-.075,.075):
            a=ang+offset
            p0=[x+r*.19*math.cos(a),facey+sign*.014,z+r*.19*math.sin(a)]
            p1=[x+r*.62*math.cos(a+.035),facey-sign*.003,z+r*.62*math.sin(a+.035)]
            tube(scene,name+f'_spoke_{i}_{offset}',[p0,p1],r*.034,'rim')
    cylinder_y(scene,name+'_center_cap',x,facey+sign*.019,z,r*.13,.028,'chrome')
    torus(scene,name+'_hub_ring',(x,facey+sign*.035,z),r*.145,.008,'rim_dark')
    # Subtle molded grooves across visible tire shoulders.
    for k in range(32):
        a=2*math.pi*k/32
        for j in (0,1):
            yy=outer-sign*j*.08
            ra=r*(.967 if j==0 else 1.002)
            tube(scene,name+f'_tread_{k}_{j}',[[x+ra*math.cos(a-.012),yy,z+ra*math.sin(a-.012)],
                  [x+ra*math.cos(a+.012),yy-sign*.028,z+ra*math.sin(a+.012)]],.0028,'rim_dark',5)


CARS = [
    dict(name='Aster_Sedan', style='sedan', color=(.075,.24,.41,1), length=4.72, width=1.87,
         roof=1.48, belt=1.05, front=1.47, rear=-1.38, wheel=.344, cabin=(-.97,1.03)),
    dict(name='Vela_GT', style='gt', color=(.56,.075,.052,1), length=4.48, width=1.94,
         roof=1.25, belt=.94, front=1.38, rear=-1.37, wheel=.365, cabin=(-.81,.57)),
    dict(name='Atlas_SUV', style='suv', color=(.22,.265,.24,1), length=4.83, width=2.01,
         roof=1.82, belt=1.25, front=1.48, rear=-1.41, wheel=.392, cabin=(-1.07,1.04)),
]


def build(c):
    scene=trimesh.Scene()
    name=c['name']; L=c['length']/2; W=c['width']/2
    belt=c['belt']; top=belt+.095
    nose=c['cabin'][1]; tail=c['cabin'][0]
    fw=c['front']; rw=c['rear']; wr=c['wheel']; wz=wr
    style=c['style']; color=c['color']
    # Curved front/rear silhouette, arch openings cut INTO side panels rather than drawn over them.
    def edge(x):
        return W*(.962+.038*(1-(x/L)**4))
    def shoulder_z(x):
        return top-.15*max(0,(x-nose)/(L-nose))
    def floor(x):
        arch=max((math.sqrt(max(0,(wr+.095)**2-(x-w)**2))+wz-.012)
                 if abs(x-w)<wr+.095 else .23 for w in (fw,rw))
        return min(arch,.92 if style=='suv' else .83)
    xs=np.linspace(-L,L,129)
    for sign, side in ((-1,'right'),(1,'left')):
        # Convex side panels: three lofted belts, with a tucked-in rocker and rounded shoulder.
        rows=[]
        for x in xs:
            y=sign*edge(x); bottom=floor(x)
            rows.append([[x,y*.94,bottom], [x,y*.995,bottom+.065],
                         [x,y, (bottom+belt)*.51], [x,y*.987,belt-.07],
                         [x,y*.925,shoulder_z(x)]])
        surface(scene,side+'_sculpted_fenders_and_doors',rows,'paint',color)
        # Paint shoulder and flowing door crease.
        for h,thick,mat in ((belt-.082,.005,'dark_paint'),(top-.004,.006,'paint')):
            tube(scene,side+f'_character_line_{h:.2f}',[[x,sign*edge(x)*(.992 if h<belt else .925),h if h<belt else shoulder_z(x)-.004] for x in xs],thick,mat,color=color if mat=='paint' else None)
        # Dark lower valance and a metallic sill.
        tube(scene,side+'_satin_rocker',[[x,sign*edge(x)*.95,.205] for x in np.linspace(rw+wr+.13,fw-wr-.13,27)],.022,'rim_dark')
        # Arch lip follows the actual wheel opening.
        for wheelx in (rw,fw):
            angles=np.linspace(0,math.pi,32)
            pts=[[wheelx+(wr+.102)*math.cos(a),sign*edge(wheelx+(wr+.102)*math.cos(a))*1.009,
                  wz+(wr+.102)*math.sin(a)] for a in angles]
            tube(scene,side+f'_arch_{wheelx:.2f}',pts,.012,'dark_paint')
        # Door seams and handles sculpted as precise contrasting trim.
        doorcuts= [tail+.12, -.16, .88] if style!='gt' else [tail+.12,.54]
        for x in doorcuts:
            tube(scene,side+f'_door_seam_{x:.2f}',[[x,sign*edge(x)*1.003,z] for z in np.linspace(.32,belt-.13,9)],.004,'dark_paint')
        for x in ([.28,-.67] if style!='gt' else [-.02]):
            box(scene,side+f'_handle_recess_{x}',(x,sign*(edge(x)+.009),belt-.14),(.165,.012,.043),'dark_paint')
            tube(scene,side+f'_chrome_handle_{x}',[[x-.065,sign*(edge(x)+.018),belt-.126],[x+.062,sign*(edge(x)+.018),belt-.126]],.008,'chrome')
        # Mirror: stalk, painted housing and inset reflective pane.
        mx=nose-.075; my=sign*(W-.035); mz=belt+.065
        tube(scene,side+'_mirror_stalk',[[mx,my,mz],[mx+.025,my+sign*.115,mz+.055]],.023,'rim_dark')
        box(scene,side+'_mirror_housing',(mx+.055,my+sign*.158,mz+.077),(.155,.13,.07),'paint')
        box(scene,side+'_mirror_glass',(mx-.019,my+sign*.214,mz+.081),(.088,.006,.041),'chrome')
    # Smooth hood and trunk, gently crowned across the centerline.
    def deck(label,lo,hi,highlo,highhi):
        rows=[]
        for x in np.linspace(lo,hi,28):
            u=(x-lo)/max(hi-lo,1e-6); zz=highlo*(1-u)+highhi*u
            rows.append([[x,y*edge(x)*.93/W,zz+.023*(1-(y/W)**2)] for y in np.linspace(-W,W,23)])
        surface(scene,label,rows,'paint',color)
    deck('bonnet_crowned',nose,L,top,top-.15)
    deck('rear_deck_crowned',-L,tail,top,top)
    # Thin fascia layers give lamps and grille realistic depth.
    for x, suffix, high in ((L,'front',top-.15),(-L,'rear',top)):
        rows=[[[x,yy,zz] for yy in np.linspace(-W*.95,W*.95,20)] for zz in (.23,high)]
        surface(scene,suffix+'_painted_fascia',rows,'paint',color)
        box(scene,suffix+'_lower_air_intake',(x+(.012 if x>0 else -.012),0,.37),(.021,W*1.25,.185),'black')
        tube(scene,suffix+'_bumper_brightwork',[[x+(.024 if x>0 else -.024),y,.25] for y in np.linspace(-W*.88,W*.88,17)],.013,'chrome')
        if x>0:
            box(scene,'front_main_grille',(x+.023,0,high-.21),(.035,W*.91,.26),'black')
            for z in np.linspace(high-.32,high-.12,5):
                tube(scene,'grille_horizontal_blade',[[x+.047,y,z] for y in np.linspace(-W*.43,W*.43,13)],.006,'rim_dark')
            for sign in (-1,1):
                y=sign*W*.74
                box(scene,f'headlight_{sign}_dark_bucket',(x+.025,y,high-.077),(.033,W*.38,.108),'black')
                box(scene,f'headlight_{sign}_lens',(x+.045,y,high-.066),(.015,W*.34,.076),'lights')
                tube(scene,f'headlight_{sign}_DRL',[[x+.058,v,high-.027] for v in np.linspace(y-sign*W*.15,y+sign*W*.15,9)],.008,'lights')
                box(scene,f'foglight_{sign}',(x+.028,sign*W*.82,.44),(.025,.125,.035),'lights')
        else:
            for sign in (-1,1):
                y=sign*W*.69
                box(scene,f'tail_lamp_{sign}_recess',(x-.025,y,high-.085),(.033,W*.43,.145),'black')
                box(scene,f'tail_lamp_{sign}_red_lens',(x-.047,y,high-.076),(.015,W*.40,.115),'taillight')
                box(scene,f'tail_lamp_{sign}_indicator',(x-.055,sign*W*.49,high-.067),(.009,.11,.018),'amber')
                box(scene,f'exhaust_{sign}',(x-.025,sign*W*.70,.288),(.09,.15,.045),'chrome')
        box(scene,suffix+'_number_plate',(x+(.04 if x>0 else -.04),0,high-.43),(.01,.32,.082),'rim')
    # Cabin: curved greenhouse with raked windshield, rear glass and subtly domed roof.
    a,b=tail,nose
    cabtop=c['roof']
    roofstart=a+.36 if style!='gt' else a+.50
    roofend=b-.39 if style!='suv' else b-.27
    def cab_width(x):
        u=(x-a)/(b-a)
        return W*(.81-.085*abs(2*u-1))
    lower=[]; upper=[]
    for x in np.linspace(a,b,37):
        u=(x-a)/(b-a)
        h=max(0,min(1,(x-a)/max(roofstart-a,.01),(b-x)/max(b-roofend,.01)))
        h=h*h*(3-2*h)
        z=top+(cabtop-top)*h
        lower.append([[x,y,top+.018] for y in np.linspace(-cab_width(x),cab_width(x),21)])
        upper.append([[x,y*(.83+.17*(1-h)),z+.024*(1-(y/cab_width(x))**2)*h] for y in np.linspace(-cab_width(x),cab_width(x),21)])
    # Roof is opaque paint; glass faces placed just outside structural shell.
    upper_mid=[row for row in upper if roofstart-.03<=row[0][0]<=roofend+.03]
    surface(scene,'continuous_curved_roof',upper_mid,'paint',color)
    for label,xx1,xx2 in (('front_windshield',roofend,b),('rear_windshield',a,roofstart)):
        rows=[]
        for x in np.linspace(xx1,xx2,18):
            u=(x-a)/(b-a); h=max(0,min(1,(x-a)/max(roofstart-a,.01),(b-x)/max(b-roofend,.01)))
            h=h*h*(3-2*h)
            z=top+(cabtop-top)*h+.004
            rows.append([[x,y*(.83+.17*(1-h)),z+.024*(1-(y/cab_width(x))**2)*h+.006] for y in np.linspace(-cab_width(x)*.965,cab_width(x)*.965,20)])
        surface(scene,label,rows,'glass')
    for sign,side in ((-1,'right'),(1,'left')):
        def edgept(x,up=False):
            h=max(0,min(1,(x-a)/max(roofstart-a,.01),(b-x)/max(b-roofend,.01)))
            h=h*h*(3-2*h)
            return [x,sign*cab_width(x)*(.83+.17*(1-h))*(1.003 if up else 1),top+(cabtop-top)*h]
        tube(scene,side+'_roof_rim',[edgept(x,True) for x in np.linspace(roofstart,roofend,20)],.017,'chrome')
        tube(scene,side+'_window_sill',[[x,sign*cab_width(x),top+.016] for x in np.linspace(a,b,23)],.012,'chrome')
        # Side glass triangles on slanted A and C pillars, separate front and rear windows.
        split=(a+b)*.51 if style!='gt' else a+(b-a)*.57
        segments=[(a+.045,split),(split,b-.045)] if style!='gt' else [(a+.045,b-.045)]
        for idx,(lo,hi) in enumerate(segments):
            rows=[]
            for x in np.linspace(lo+.035,hi-.035,12):
                u=(x-a)/(b-a)
                h=max(0,min(1,(x-a)/max(roofstart-a,.01),(b-x)/max(b-roofend,.01)))
                h=h*h*(3-2*h)
                y=sign*cab_width(x)*(.83+.17*(1-h))*1.006
                rows.append([[x,y,top+.052],[x,y,max(top+.055,top+(cabtop-top)*h-.041)]])
            surface(scene,side+f'_side_window_{idx}',rows,'glass')
        for x,lab in ((roofstart,'C'),(split,'B'),(roofend,'A')):
            if style=='gt' and lab=='B':continue
            bot=[x,sign*cab_width(x),top+.013]
            hi=edgept(x,True)
            tube(scene,side+f'_{lab}_pillar',[bot,hi],.021,'black')
        tube(scene,side+'_windshield_pillar',[edgept(x,True) for x in np.linspace(roofend,b,13)],.015,'black')
        tube(scene,side+'_rear_pillar',[edgept(x,True) for x in np.linspace(a,roofstart,13)],.016,'black')
    # Dark cabin visible through windscreens rather than a hollow transparent box.
    box(scene,'dashboard',(b-.31,0,top-.13),(.35,W*1.34,.10),'interior')
    for x in (a+.53,b-.61):
        for sign in (-1,1):
            box(scene,f'seat_{x:.2f}_{sign}',(x,sign*.37,top-.28),(.42,.38,.42),'interior')
    # Undertray closes silhouette, suppressing hollow gaps under the car.
    box(scene,'underbody',((fw+rw)/2,0,.245),(fw-rw+.21,W*1.55,.105),'black')
    for pos,x in (('front',fw),('rear',rw)):
        for sign in (-1,1):
            wheel(scene,f'{pos}_{"left" if sign>0 else "right"}_wheel',x,sign*(W-.075),wz,wr,sign,style)
    return scene


def main():
    for car in CARS:
        s=build(car)
        out=OUT/(car['name']+'.glb')
        out.write_bytes(s.export(file_type='glb'))
        print(f'{out.relative_to(ROOT)}: {len(s.geometry)} individually named parts, {out.stat().st_size/1024:.0f} KiB')

if __name__=='__main__': main()
