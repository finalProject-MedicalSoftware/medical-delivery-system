#!/usr/bin/env python3
"""Create an editable 16:9 keynote-style PowerPoint using Python stdlib."""
from html import escape
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

OUT = Path("docs/medical-delivery-integration-roadmap.pptx")
W, H = 12192000, 6858000
INK, PAPER, WHITE, LIME, GRAY, LINE = "171817", "F4F3EE", "FFFFFF", "D7FF64", "72756E", "D8D9D2"
slides = [
    ("WEEKLY REPORT  /  SHIP ’26", "MEDICAL\nDELIVERY", "Dua minggu membangun fondasi demo dan menyiapkan pembuktian alur kerja.", ["31 OKTOBER 2026", "FOKUS  /  ADMINISTRASI OPERASIONAL + ROBOTIC SOFTWARE", "STATUS  /  DEMO SINTETIS — BUKAN SISTEM KLINIS LIVE"], "cover"),
    ("01  /  DUA MINGGU TERAKHIR", "Dari struktur kerja\nke kontrol robot.", "Pekerjaan dibangun bertahap: rapikan fondasi, sepakati aturan data, lalu sambungkan simulasi robot ke tampilan.", ["22 OKT  /  Struktur proyek dan kontrak dasar dirapikan agar tiap tim punya batas kerja jelas.", "23 OKT  /  Aturan QR, serah-terima manusia, HMI, dan jembatan antar-layanan ditulis.", "26 OKT  /  Komponen dikonsolidasikan ke satu repo agar build dan pengecekan lebih mudah diulang.", "27 OKT  /  Alur perintah robot dibuat: kontrak → adapter backend/WS → halaman Robot Control.", "27 OKT  /  Peta membedakan status simulated/live; debugging dan pengecekan hasil perintah dilanjutkan.", "HASIL  /  Backend, robot simulasi, outbox SIMRS Dummy, gateway WS, dan dashboard tersedia untuk demo."], "light"),
    ("02  /  KENDALA", "Yang sudah ada\nbelum otomatis terbukti.", "Kendala utama ada pada pembuktian lintas layanan dan kesiapan pemilik sistem—bukan sekadar menambah fitur.", ["VERIFIKASI  /  Alur SIMRS → backend → gateway → dashboard belum punya bukti E2E tersimpan.", "DATA & AKSES  /  Endpoint, izin, dan kredensial SIMRS resmi belum tersedia untuk acceptance live.", "OPERASIONAL  /  Retry, duplikasi, reconnect, resync, restart, dan redaksi log perlu diuji.", "ROBOT  /  Jalur saat ini masih simulasi; robot fisik dan HMI belum masuk acceptance.", "KEPUTUSAN  /  Backend direct Kafka dan integrasi nyata masih menunggu owner serta persetujuan bersama."], "dark"),
    ("03  /  RENCANA 10 HARI KERJA", "Satu hari, satu\nbukti kemajuan.", "Targetnya bukan menyelesaikan semuanya sekaligus, tetapi menutup satu pertanyaan operasional setiap hari.", ["HARI 1  /  Nyalakan stack demo; catat service yang hidup dan prasyarat yang kurang.", "HARI 2  /  Periksa environment, Postman variables, dan pastikan secret tidak masuk output.", "HARI 3  /  Uji SIMRS Dummy: outbox membuat event dan relay mengirim callback.", "HARI 4  /  Uji callback/backend ke HTTP bridge; simpan request-response tanpa token.", "HARI 5  /  Uji gateway: event masuk Kafka, keluar WS, lalu terlihat di BFF/SSE.", "HARI 6  /  Uji auth dan kasus negatif: token salah, payload tidak valid, timeout/5xx.", "HARI 7  /  Uji retry, dedupe, reconnect, dan read API sebagai resync/fallback.", "HARI 8  /  Selaraskan kontrak, status, checklist, dan collection Postman berdasarkan hasil uji.", "HARI 9  /  Simulasikan restart/lag; rapikan log, runbook demo, dan langkah rollback.", "HARI 10  /  Demo acceptance internal; tulis gap, owner, dependensi, dan keputusan go/no-go."], "light"),
    ("04  /  TARGET AKHIR", "Bukti yang bisa\ndipakai untuk memutuskan.", "Akhir dua minggu adalah baseline demo yang dapat diulang—bukan klaim bahwa integrasi klinis sudah live.", ["DEMO  /  Satu alur Postman SIMRS Dummy → backend → gateway → dashboard dapat diulang.", "BUKTI  /  Hasil tiap hop, negative case, retry, dedupe, reconnect, dan resync tersimpan.", "DOKUMEN  /  Kontrak, checklist, runbook singkat, batas simulasi, dan daftar risiko selaras.", "OWNER  /  Setiap gap memiliki pemilik, kebutuhan akses, dan langkah berikutnya yang jelas.", "KEPUTUSAN  /  Go/no-go fase integrasi nyata; direct Kafka, HMI, dan robot fisik tetap gate terpisah."], "dark"),
]

def text_shape(text, x, y, w, h, size, color, bold=False, font="Arial"):
    paragraphs = []
    for line in text.split("\n"):
        paragraphs.append(f'<a:p><a:pPr/><a:r><a:rPr lang="id-ID" sz="{size}" b="{int(bold)}"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:latin typeface="{font}"/></a:rPr><a:t>{escape(line)}</a:t></a:r><a:endParaRPr lang="id-ID"/></a:p>')
    return f'<p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>{"".join(paragraphs)}</p:txBody></p:sp>'

def rect(x, y, w, h, color):
    return f'<p:sp><p:nvSpPr><p:cNvPr id="3" name="Accent"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>'

def slide_xml(slide, i):
    label, title, sub, bullets, theme = slide
    dark = theme in ("dark", "cover", "close")
    bg, fg, secondary = (INK, WHITE, "B8BBB4") if dark else (PAPER, INK, GRAY)
    shapes = [rect(0, 0, W, H, bg), rect(720000, 510000, 420000, 60000, LIME)]
    shapes += [text_shape(label, 720000, 680000, 10500000, 300000, 1100, LIME, True)]
    title_size = 4400 if theme == "cover" else 3200
    title_y = 1550000 if theme == "cover" else 1250000
    title_h = 1800000 if theme == "cover" else 1300000
    shapes.append(text_shape(title, 700000, title_y, 11000000, title_h, title_size, fg, True, "Arial"))
    shapes.append(text_shape(sub, 740000, 3550000 if theme == "cover" else 2780000, 10500000, 660000, 1700 if theme == "cover" else 1450, secondary))
    if theme == "cover":
        shapes.append(rect(740000, 4700000, 240000, 240000, LIME))
        shapes.append(text_shape(bullets[0], 1100000, 4650000, 9900000, 340000, 1300, WHITE, True))
        shapes.append(text_shape(bullets[1], 740000, 5200000, 10500000, 300000, 1100, secondary))
        shapes.append(text_shape(bullets[2], 740000, 5600000, 10500000, 300000, 1050, secondary))
    else:
        if len(bullets) > 6:
            # Ten daily actions fit as two readable columns instead of a dense list.
            for j, bullet in enumerate(bullets):
                col, row = divmod(j, 5)
                x = 760000 + col * 5600000
                y = 3500000 + row * 520000
                shapes.append(rect(x, y + 80000, 90000, 90000, LIME if j == 0 else ("444741" if dark else LINE)))
                shapes.append(text_shape(bullet, x + 260000, y, 5000000, 400000, 1080, fg))
        else:
            start_y = 3500000
            step = 440000 if len(bullets) == 6 else 485000
            for j, bullet in enumerate(bullets):
                y = start_y + j * step
                shapes.append(rect(760000, y + 80000, 90000, 90000, LIME if j == 0 else ("444741" if dark else LINE)))
                shapes.append(text_shape(bullet, 1020000, y, 10300000, 340000, 1260 if len(bullets) == 6 else 1370, fg))
    shapes.append(text_shape(f"MEDICAL DELIVERY     /     WEEKLY REPORT                                      {i+1:02d}", 720000, 6420000, 10800000, 260000, 900, secondary))
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="0" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>{"".join(shapes)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'

OUT.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(OUT, "w", ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' + ''.join(f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' for i in range(1, len(slides)+1)) + '</Types>')
    z.writestr("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>')
    z.writestr("ppt/presentation.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>{"".join(f"<p:sldId id='{256+i}' r:id='rId{i+2}'/>" for i in range(len(slides)))}</p:sldIdLst><p:sldSz cx="{W}" cy="{H}" type="wide"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>')
    z.writestr("ppt/_rels/presentation.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' + ''.join(f'<Relationship Id="rId{i+2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i+1}.xml"/>' for i in range(len(slides))) + '</Relationships>')
    z.writestr("ppt/slideMasters/slideMaster1.xml", '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="0" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>')
    z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>')
    z.writestr("ppt/slideLayouts/slideLayout1.xml", '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="0" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>')
    z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>')
    z.writestr("ppt/theme/theme1.xml", '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Ship 26"><a:themeElements><a:clrScheme name="Ship 26"><a:dk1><a:srgbClr val="171817"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="72756E"/></a:dk2><a:lt2><a:srgbClr val="F4F3EE"/></a:lt2><a:accent1><a:srgbClr val="D7FF64"/></a:accent1><a:accent2><a:srgbClr val="D8D9D2"/></a:accent2><a:accent3><a:srgbClr val="B8BBB4"/></a:accent3><a:accent4><a:srgbClr val="171817"/></a:accent4><a:accent5><a:srgbClr val="72756E"/></a:accent5><a:accent6><a:srgbClr val="F4F3EE"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Ship 26"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>')
    for i, slide in enumerate(slides, 1):
        z.writestr(f"ppt/slides/slide{i}.xml", slide_xml(slide, i - 1))
        z.writestr(f"ppt/slides/_rels/slide{i}.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>')
with ZipFile(OUT) as z:
    names = z.namelist()
    assert len([n for n in names if n.startswith("ppt/slides/slide") and n.endswith(".xml") and "/_rels/" not in n]) == len(slides)
    content = "".join(z.read(f"ppt/slides/slide{i}.xml").decode() for i in range(1, len(slides) + 1))
    assert all(escape(s[1].split("\n")[0]) in content for s in slides)
    assert "bridge_dev_secret" not in content and "monitoringToken" not in content
print(OUT)
