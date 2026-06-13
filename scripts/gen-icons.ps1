# Generates every app icon from the brand logo (winkyhorse.png — winking horse on a
# cream circle in a black rounded tile):
#   - Android launcher icons (legacy full tile, round, adaptive foreground + background color)
#   - Android notification status icon (white alpha silhouette of the horse)
#   - Android splash screens (cream background, horse circle centered)
#   - src/assets/horse.png (in-app logo used by Logo.tsx)
#   - Desktop tray/exe .ico files (horse circle; green/red status dot variants)
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File scripts\gen-icons.ps1

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$repo = Split-Path -Parent $PSScriptRoot
$res  = Join-Path $repo "android\app\src\main\res"
$desktopAssets = Join-Path $repo "desktop\assets"
$srcLogo = Join-Path $repo "winkyhorse.png"

# Brand colors sampled from the logo
$TILE_BLACK = [System.Drawing.Color]::FromArgb(255, 0x02, 0x02, 0x02)
$CREAM      = [System.Drawing.Color]::FromArgb(255, 0xF5, 0xF3, 0xE6)
$GREEN      = [System.Drawing.Color]::FromArgb(255, 0x22, 0xc5, 0x5e)
$RED        = [System.Drawing.Color]::FromArgb(255, 0xef, 0x44, 0x44)

# ---------- extract master art from winkyhorse.png ----------
$master = New-Object System.Drawing.Bitmap($srcLogo)
# The main 474x474 tile sits at (74,266) in the 1024px mockup
$TILE = $master.Clone([System.Drawing.Rectangle]::new(74, 266, 474, 474), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$master.Dispose()

# Cream circle: concentric with the tile, diameter ~441px
$CIRCLE_D = 441
$off = [int]((474 - $CIRCLE_D) / 2)
$CIRCLE = New-Object System.Drawing.Bitmap($CIRCLE_D, $CIRCLE_D, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$cg = [System.Drawing.Graphics]::FromImage($CIRCLE)
$cg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddEllipse(0, 0, $CIRCLE_D, $CIRCLE_D)
$cg.SetClip($path)
$cg.DrawImage($TILE, -$off, -$off, 474, 474)
$cg.Dispose(); $path.Dispose()

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$outPath) {
    $dir = Split-Path -Parent $outPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "wrote $outPath"
}

function New-Scaled([System.Drawing.Image]$src, [int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.DrawImage($src, 0, 0, $w, $h)
    $g.Dispose()
    return $bmp
}

# Scale $src onto a $size canvas at $scale, optional solid background
function New-Canvas([System.Drawing.Image]$src, [int]$size, [double]$scale, [object]$bg) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    if ($null -ne $bg) { $g.Clear($bg) }
    $m = [int]($size * $scale)
    $g.DrawImage($src, [int](($size - $m) / 2), [int](($size - $m) / 2), $m, $m)
    $g.Dispose()
    return $bmp
}

# ---------- Android launcher icons ----------
$densities = @{ "mdpi" = 48; "hdpi" = 72; "xhdpi" = 96; "xxhdpi" = 144; "xxxhdpi" = 192 }
foreach ($d in $densities.Keys) {
    $s = $densities[$d]
    $b = New-Scaled $TILE $s $s
    Save-Png $b (Join-Path $res "mipmap-$d\ic_launcher.png"); $b.Dispose()
    $b = New-Canvas $CIRCLE $s 1.0 $TILE_BLACK   # round: black disc base, cream circle full-bleed
    Save-Png $b (Join-Path $res "mipmap-$d\ic_launcher_round.png"); $b.Dispose()
}
# Adaptive: foreground horse circle inside the 66/108 safe zone, black background color
$fgDensities = @{ "mdpi" = 108; "hdpi" = 162; "xhdpi" = 216; "xxhdpi" = 324; "xxxhdpi" = 432 }
foreach ($d in $fgDensities.Keys) {
    $b = New-Canvas $CIRCLE $fgDensities[$d] 0.60 $null
    Save-Png $b (Join-Path $res "mipmap-$d\ic_launcher_foreground.png"); $b.Dispose()
}
$bgXml = "<?xml version=`"1.0`" encoding=`"utf-8`"?>`n<resources>`n    <color name=`"ic_launcher_background`">#020202</color>`n</resources>"
Set-Content -Path (Join-Path $res "values\ic_launcher_background.xml") -Value $bgXml -Encoding utf8
Write-Output "wrote values\ic_launcher_background.xml (#020202)"

# ---------- Android notification status icon (white alpha silhouette of the horse) ----------
$statDensities = @{ "mdpi" = 24; "hdpi" = 36; "xhdpi" = 48; "xxhdpi" = 72; "xxxhdpi" = 96 }
foreach ($d in $statDensities.Keys) {
    $s = $statDensities[$d]
    $scaled = New-Scaled $CIRCLE $s $s
    $sil = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    for ($y = 0; $y -lt $s; $y++) {
        for ($x = 0; $x -lt $s; $x++) {
            $p = $scaled.GetPixel($x, $y)
            if ($p.A -gt 64) {
                $lum = 0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B
                # dark strokes of the horse become opaque white; cream disc becomes transparent
                $alpha = [int][Math]::Max(0, [Math]::Min(255, (200 - $lum) * 1.8))
                $sil.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
            }
        }
    }
    Save-Png $sil (Join-Path $res "drawable-$d\ic_stat_icon.png")
    $sil.Dispose(); $scaled.Dispose()
}

# ---------- Android splash (cream background, horse circle centered) ----------
Get-ChildItem (Join-Path $res "drawable*") -Filter "splash.png" -Recurse | ForEach-Object {
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    $w = $img.Width; $h = $img.Height
    $img.Dispose()
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($CREAM)
    $m = [int]([Math]::Min($w, $h) * 0.34)
    $g.DrawImage($CIRCLE, [int](($w - $m) / 2), [int](($h - $m) / 2), $m, $m)
    $g.Dispose()
    Save-Png $bmp $_.FullName
    $bmp.Dispose()
}

# ---------- In-app logo asset ----------
$b = New-Scaled $CIRCLE 512 512
Save-Png $b (Join-Path $repo "src\assets\horse.png"); $b.Dispose()
$b = New-Scaled $TILE 512 512
Save-Png $b (Join-Path $repo "src\assets\horse-tile.png"); $b.Dispose()

# ---------- Desktop tray / exe icons ----------
function New-Ico([string]$outPath, [object]$dotColor) {
    $sizes = 16, 24, 32, 48, 256
    $pngs = @()
    foreach ($s in $sizes) {
        $bmp = New-Canvas $CIRCLE $s 1.0 $null
        if ($null -ne $dotColor) {
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $ds = [Math]::Max(6, [int]($s * 0.42))
            $br = New-Object System.Drawing.SolidBrush($dotColor)
            $pen = New-Object System.Drawing.Pen($CREAM, [Math]::Max(1, [int]($s * 0.06)))
            $g.FillEllipse($br, $s - $ds, $s - $ds, $ds - 1, $ds - 1)
            $g.DrawEllipse($pen, $s - $ds, $s - $ds, $ds - 1, $ds - 1)
            $br.Dispose(); $pen.Dispose(); $g.Dispose()
        }
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $pngs += ,@($s, $ms.ToArray())
        $ms.Dispose()
    }
    $out = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($out)
    $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$pngs.Count)
    $offset = 6 + 16 * $pngs.Count
    foreach ($p in $pngs) {
        $s = $p[0]; $bytes = $p[1]
        $dim = $s; if ($s -ge 256) { $dim = 0 }
        $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
        $bw.Write([uint16]1); $bw.Write([uint16]32)
        $bw.Write([uint32]$bytes.Length); $bw.Write([uint32]$offset)
        $offset += $bytes.Length
    }
    foreach ($p in $pngs) { $bw.Write([byte[]]$p[1]) }
    [System.IO.File]::WriteAllBytes($outPath, $out.ToArray())
    $bw.Dispose(); $out.Dispose()
    Write-Output "wrote $outPath"
}

New-Ico (Join-Path $desktopAssets "icon.ico")       $null
New-Ico (Join-Path $desktopAssets "icon_idle.ico")  $null
New-Ico (Join-Path $desktopAssets "icon_green.ico") $GREEN
New-Ico (Join-Path $desktopAssets "icon_red.ico")   $RED

$TILE.Dispose(); $CIRCLE.Dispose()
Write-Output "done"
